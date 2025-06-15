import { useState, useEffect, useCallback } from "react";
import { databases, ID, authService } from "./lib/appwrite";
import { initializeRxDB } from "./lib/rxdb-config";
import Auth from "./components/Auth";
import "./App.css";
import "./styles/Auth.css";

function App() {
  const [recipes, setRecipes] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [newRecipe, setNewRecipe] = useState({ name: "", ingredients: "" });
  const [newListName, setNewListName] = useState("");
  const [currentList, setCurrentList] = useState(null);
  const [activeTab, setActiveTab] = useState("recipes");
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [appInitialized, setAppInitialized] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [rxdbInstance, setRxdbInstance] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const RECIPES_COLLECTION_ID = "6844cc0a001dfcce5baa";
  const LISTS_COLLECTION_ID = "6844cf2e002c1b4ef233";
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;

  // Initialize RxDB
  const setupRxDB = useCallback(async () => {
    try {
      const rxdbSetup = await initializeRxDB();
      setRxdbInstance(rxdbSetup);
      
      // Initial data sync
      if (navigator.onLine) {
        try {
          // Wait for initial pull replication to complete
          await Promise.all([
            rxdbSetup.replication.recipes.pull.awaitInitialPull(),
            rxdbSetup.replication.lists.pull.awaitInitialPull()
          ]);
          console.log("Initial data pull complete");
        } catch (pullError) {
          console.warn("Initial data pull failed:", pullError);
        }
      }
      
      return rxdbSetup;
    } catch (error) {
      console.error("Error initializing RxDB:", error);
      setError("Failed to initialize offline database");
      return null;
    }
  }, []);

  // Fetch all recipes - first try from RxDB, fallback to Appwrite
  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      
      if (rxdbInstance) {
        try {
          // Try to get data from local database first
          const localRecipes = await rxdbInstance.dbService.getRecipes();
          if (localRecipes && localRecipes.length > 0) {
            setRecipes(localRecipes);
            setLoading(false);
            return;
          }
        } catch (localError) {
          console.warn("Error fetching from local database, falling back to remote:", localError);
        }
      }
      
      // If offline mode is enabled or local fetch failed, try remote
      if (navigator.onLine) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          RECIPES_COLLECTION_ID
        );
        setRecipes(response.documents);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      setError("Failed to fetch recipes");
      setOfflineMode(navigator.onLine === false); // Set offline mode if network error
      setLoading(false);
    }
  }, [DATABASE_ID, RECIPES_COLLECTION_ID, rxdbInstance]);

  // Fetch all shopping lists - first try from RxDB, fallback to Appwrite
  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      
      if (rxdbInstance) {
        try {
          // Try to get data from local database first
          const localLists = await rxdbInstance.dbService.getLists();
          if (localLists && localLists.length > 0) {
            setLists(localLists);
            setLoading(false);
            return;
          }
        } catch (localError) {
          console.warn("Error fetching from local database, falling back to remote:", localError);
        }
      }
      
      // If offline mode is enabled or local fetch failed, try remote
      if (navigator.onLine) {
        const response = await databases.listDocuments(
          DATABASE_ID,
          LISTS_COLLECTION_ID
        );
        setLists(response.documents);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error fetching lists:", error);
      setError("Failed to fetch lists");
      setOfflineMode(navigator.onLine === false); // Set offline mode if network error
      setLoading(false);
    }
  }, [DATABASE_ID, LISTS_COLLECTION_ID, rxdbInstance]);

  // Check for current user and initialize app
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Check if we have the necessary environment variables
        if (!import.meta.env.VITE_APPWRITE_DATABASE_ID) {
          throw new Error("Missing DATABASE_ID in environment variables. Please add VITE_APPWRITE_DATABASE_ID to your .env file.");
        }
        
        // Check if user is logged in
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        setAuthChecked(true);
        
        // If user is logged in, initialize RxDB and fetch data
        if (currentUser) {
          await setupRxDB();
          await Promise.all([fetchRecipes(), fetchLists()]);
          setAppInitialized(true);
        }
      } catch (error) {
        console.error("Error checking authentication:", error);
        setError(error.message || "Failed to initialize app");
      } finally {
        setLoading(false);
      }
    };
    
    checkAuth();
  }, [fetchRecipes, fetchLists, setupRxDB]);
  
  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      console.log("App is online");
      setIsOnline(true);
      setOfflineMode(false);
      // Refresh data when coming back online
      if (user && rxdbInstance) {
        fetchRecipes();
        fetchLists();
      }
    };
    
    const handleOffline = () => {
      console.log("App is offline");
      setIsOnline(false);
      setOfflineMode(true);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Set initial offline state
    setOfflineMode(!navigator.onLine);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, rxdbInstance, fetchRecipes, fetchLists]);
  
  // Handle successful login
  const handleLoginSuccess = async () => {
    try {
      setLoading(true);
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      
      // Initialize RxDB and fetch data after login
      await setupRxDB();
      await Promise.all([fetchRecipes(), fetchLists()]);
      setAppInitialized(true);
    } catch (error) {
      console.error("Error after login:", error);
      setError("Failed to initialize app after login");
    } finally {
      setLoading(false);
    }
  };
  
  // Handle logout
  const handleLogout = async () => {
    try {
      await authService.logout();
      setUser(null);
      setAppInitialized(false);
      setRecipes([]);
      setLists([]);
      setCurrentList(null);
      setSelectedRecipes([]);
    } catch (error) {
      console.error("Logout error:", error);
      setError("Failed to logout");
    }
  };
  
  // Handle recipe creation
  const handleCreateRecipe = async (e) => {
    e.preventDefault();
    
    if (!newRecipe.name || !newRecipe.ingredients) {
      setError("Recipe name and ingredients are required");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const ingredientsArray = newRecipe.ingredients
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");

      const recipeId = ID.unique();
      const recipeData = {
        $id: recipeId,
        name: newRecipe.name,
        ingredients: ingredientsArray
      };
      
      // In offline mode, only save to local database
      if (offlineMode && rxdbInstance) {
        const newRecipeDoc = await rxdbInstance.dbService.createRecipe(recipeData);
        setRecipes([...recipes, newRecipeDoc]);
      } else {
        // In online mode, save to Appwrite and local database will sync via replication
        const response = await databases.createDocument(
          DATABASE_ID,
          RECIPES_COLLECTION_ID,
          recipeId,
          {
            name: newRecipe.name,
            ingredients: ingredientsArray,
          }
        );
        setRecipes([...recipes, response]);
      }

      setNewRecipe({ name: "", ingredients: "" });
      setLoading(false);
    } catch (error) {
      console.error("Error creating recipe:", error);
      setError("Failed to create recipe");
      setLoading(false);
    }
  };
  
  // Handle recipe deletion
  const deleteRecipe = async (recipeId) => {
    try {
      setLoading(true);
      
      // In offline mode, only delete from local database
      if (offlineMode && rxdbInstance) {
        await rxdbInstance.dbService.deleteRecipe(recipeId);
      } else {
        // Delete from Appwrite
        await databases.deleteDocument(
          DATABASE_ID,
          RECIPES_COLLECTION_ID,
          recipeId
        );
      }
      
      setRecipes(recipes.filter((recipe) => recipe.$id !== recipeId));
      setSelectedRecipes(selectedRecipes.filter((id) => id !== recipeId));
      setLoading(false);
    } catch (error) {
      console.error("Error deleting recipe:", error);
      setError("Failed to delete recipe");
      setLoading(false);
    }
  };
  
  // Handle shopping list creation
  const createList = async (e) => {
    e.preventDefault();
    
    if (!newListName) {
      setError("List name is required");
      return;
    }
    
    if (selectedRecipes.length === 0) {
      setError("Please select at least one recipe");
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Gather all ingredients from selected recipes
      const allIngredients = [];
      selectedRecipes.forEach((recipeId) => {
        const recipe = recipes.find((r) => r.$id === recipeId);
        recipe.ingredients.forEach((ingredient) => {
          if (!allIngredients.includes(ingredient)) {
            allIngredients.push(ingredient);
          }
        });
      });

      const listId = ID.unique();
      const listData = {
        $id: listId,
        name: newListName,
        items: allIngredients
      };
      
      // In offline mode, only save to local database
      if (offlineMode && rxdbInstance) {
        const newListDoc = await rxdbInstance.dbService.createList(listData);
        setLists([...lists, newListDoc]);
      } else {
        // In online mode, save to Appwrite and local database will sync via replication
        const response = await databases.createDocument(
          DATABASE_ID,
          LISTS_COLLECTION_ID,
          listId,
          {
            name: newListName,
            items: allIngredients,
          }
        );
        setLists([...lists, response]);
      }

      setNewListName("");
      setSelectedRecipes([]);
      setActiveTab("lists");
      setLoading(false);
    } catch (error) {
      console.error("Error creating list:", error);
      setError("Failed to create shopping list");
      setLoading(false);
    }
  };
  
  // Handle shopping list deletion
  const deleteList = async (listId) => {
    try {
      setLoading(true);
      
      // In offline mode, only delete from local database
      if (offlineMode && rxdbInstance) {
        await rxdbInstance.dbService.deleteList(listId);
      } else {
        // Delete from Appwrite
        await databases.deleteDocument(
          DATABASE_ID,
          LISTS_COLLECTION_ID,
          listId
        );
      }
      
      setLists(lists.filter((list) => list.$id !== listId));
      if (currentList && currentList.$id === listId) {
        setCurrentList(null);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error deleting list:", error);
      setError("Failed to delete shopping list");
      setLoading(false);
    }
  };

  // Toggle recipe selection for shopping list
  const toggleRecipeSelection = (recipeId) => {
    if (selectedRecipes.includes(recipeId)) {
      setSelectedRecipes(selectedRecipes.filter((id) => id !== recipeId));
    } else {
      setSelectedRecipes([...selectedRecipes, recipeId]);
    }
  };

  // View a specific shopping list
  const viewList = (list) => {
    setCurrentList(list);
  };

  // Back to lists overview
  const backToLists = () => {
    setCurrentList(null);
  };

  // Copy shopping list items to clipboard
  const copyListToClipboard = () => {
    if (!currentList || !currentList.items.length) return;
    
    const listText = currentList.items.join('\n');
    navigator.clipboard.writeText(listText)
      .then(() => {
        alert('Shopping list copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy list: ', err);
        setError('Failed to copy list to clipboard');
      });
  };

  return (
    <div className="app-container">
      <header>
        <h1>Shopping List App</h1>
        {user && (
          <div className="header-controls">
            {offlineMode && (
              <div className="offline-indicator">
                Offline Mode
              </div>
            )}
            <button className="logout-button" onClick={handleLogout}>
              Logout
            </button>
          </div>
        )}
      </header>

      {loading && !error && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      )}

      {error && (
        <div className="error-container">
          <p className="error-message">{error}</p>
        </div>
      )}

      {!loading && authChecked && !user && !error && (
        <Auth onLoginSuccess={handleLoginSuccess} />
      )}

      {user && appInitialized && !loading && (
        <main>
          <div className="tabs">
            <button
              className={activeTab === "recipes" ? "active" : ""}
              onClick={() => setActiveTab("recipes")}
            >
              Recipes
            </button>
            <button
              className={activeTab === "lists" ? "active" : ""}
              onClick={() => setActiveTab("lists")}
            >
              Shopping Lists
            </button>
          </div>

          {activeTab === "recipes" && (
            <div className="recipes-container">
              <div className="recipes-list">
                <h2>My Recipes</h2>
                {loading ? (
                  <p>Loading recipes...</p>
                ) : recipes.length === 0 ? (
                  <p>No recipes found. Create your first recipe!</p>
                ) : (
                  <ul>
                    {recipes.map((recipe) => (
                      <li key={recipe.$id} className="recipe-item">
                        <div className="recipe-header">
                          <div className="checkbox-container">
                            <input
                              type="checkbox"
                              checked={selectedRecipes.includes(recipe.$id)}
                              onChange={() => toggleRecipeSelection(recipe.$id)}
                            />
                          </div>
                          <h3>{recipe.name}</h3>
                          <button
                            className="delete-btn"
                            onClick={() => deleteRecipe(recipe.$id)}
                          >
                            Delete
                          </button>
                        </div>
                        <details className="recipe-ingredients-accordion">
                          <summary>Ingredients</summary>
                          <div className="recipe-ingredients">
                            <ul>
                              {recipe.ingredients.map((ingredient, index) => (
                                <li key={index}>{ingredient}</li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="forms-container">
                <div className="recipe-form">
                  <h2>Add New Recipe</h2>
                  <form onSubmit={handleCreateRecipe}>
                    <div className="form-group">
                      <label htmlFor="recipe-name">Recipe Name:</label>
                      <input
                        type="text"
                        id="recipe-name"
                        value={newRecipe.name}
                        onChange={(e) =>
                          setNewRecipe({ ...newRecipe, name: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="recipe-ingredients">
                        Ingredients (comma separated):
                      </label>
                      <textarea
                        id="recipe-ingredients"
                        value={newRecipe.ingredients}
                        onChange={(e) =>
                          setNewRecipe({ ...newRecipe, ingredients: e.target.value })
                        }
                        required
                      />
                    </div>
                    <button type="submit" disabled={loading}>
                      {loading ? "Adding..." : "Add Recipe"}
                    </button>
                  </form>
                </div>

                {selectedRecipes.length > 0 && (
                  <div className="shopping-list-form">
                    <h2>Create Shopping List</h2>
                    <p>{selectedRecipes.length} recipes selected</p>
                    <form onSubmit={createList}>
                      <div className="form-group">
                        <label htmlFor="list-name">List Name:</label>
                        <input
                          type="text"
                          id="list-name"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="Enter list name"
                          required
                        />
                      </div>
                      <button type="submit" disabled={selectedRecipes.length === 0}>
                        Create Shopping List
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "lists" && (
            <div className="lists-container">
              {currentList ? (
                <div className="list-detail">
                  <div className="list-header">
                    <button onClick={backToLists} className="back-button">
                      ← Back to Lists
                    </button>
                    <h2>{currentList.name}</h2>
                    <button onClick={copyListToClipboard} className="copy-button">
                      Copy List
                    </button>
                  </div>
                  {currentList.items.length > 0 ? (
                    <ul className="shopping-items">
                      {currentList.items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No items in this list.</p>
                  )}
                </div>
              ) : (
                <>
                  <h2>Shopping Lists</h2>
                  {lists.length > 0 ? (
                    <div className="lists-grid">
                      {lists.map((list) => (
                        <div key={list.$id} className="list-card">
                          <h3>{list.name}</h3>
                          <p>{list.items.length} items</p>
                          <div className="list-actions">
                            <button onClick={() => viewList(list)}>View</button>
                            <button onClick={() => deleteList(list.$id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No shopping lists yet. Create one from your recipes!</p>
                  )}
                  <button
                    className="toggle-form-button"
                    onClick={() => setShowListForm(!showListForm)}
                  >
                    {showListForm ? "Hide Form" : "Create List"}
                  </button>
                  {showListForm && (
                    <div className="shopping-list-form">
                      <h2>Create Shopping List</h2>
                      <p>{selectedRecipes.length} recipes selected</p>
                      <form onSubmit={createList}>
                        <div className="form-group">
                          <label htmlFor="list-name">List Name:</label>
                          <input
                            type="text"
                            id="list-name"
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            placeholder="Enter list name"
                            required
                          />
                        </div>
                        <div className="recipe-selection">
                          <h3>Select Recipes:</h3>
                          {recipes.length > 0 ? (
                            <div className="recipe-checkboxes">
                              {recipes.map((recipe) => (
                                <div key={recipe.$id} className="recipe-checkbox">
                                  <input
                                    type="checkbox"
                                    id={`recipe-${recipe.$id}`}
                                    checked={selectedRecipes.includes(recipe.$id)}
                                    onChange={() => toggleRecipeSelection(recipe.$id)}
                                  />
                                  <label htmlFor={`recipe-${recipe.$id}`}>
                                    {recipe.name}
                                  </label>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p>No recipes available. Add some recipes first!</p>
                          )}
                        </div>
                        <button
                          type="submit"
                          disabled={selectedRecipes.length === 0 || !newListName}
                        >
                          Create List
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
