import { useState, useEffect, useCallback } from "react";
import { databases, ID, authService } from "./lib/appwrite";
import Auth from "./components/Auth";
import "./App.css";
import "./styles/Auth.css";

function App() {
  const [recipes, setRecipes] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [currentList, setCurrentList] = useState(null);
  const [newRecipe, setNewRecipe] = useState({ name: "", ingredients: "" });
  const [newListName, setNewListName] = useState("");
  const [activeTab, setActiveTab] = useState("recipes"); // recipes, lists
  const [loading, setLoading] = useState(true); // Start with loading state
  const [error, setError] = useState(null);
  const [appInitialized, setAppInitialized] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const RECIPES_COLLECTION_ID = "6844cc0a001dfcce5baa";
  const LISTS_COLLECTION_ID = "6844cf2e002c1b4ef233";
  // Use a default value for DATABASE_ID if not provided in environment variables
  const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "default";
  
  // Debug information
  console.log("Environment variables:", {
    DATABASE_ID,
    endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT,
    projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID
  });
  
  // Fetch all recipes from Appwrite
  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await databases.listDocuments(
        DATABASE_ID,
        RECIPES_COLLECTION_ID
      );
      setRecipes(response.documents);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      setError("Failed to fetch recipes");
      setLoading(false);
    }
  }, [DATABASE_ID, RECIPES_COLLECTION_ID]);

  // Fetch all shopping lists from Appwrite
  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const response = await databases.listDocuments(
        DATABASE_ID,
        LISTS_COLLECTION_ID
      );
      setLists(response.documents);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching lists:", error);
      setError("Failed to fetch lists");
      setLoading(false);
    }
  }, [DATABASE_ID, LISTS_COLLECTION_ID]);

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
        
        // If user is logged in, fetch data
        if (currentUser) {
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
  }, [fetchRecipes, fetchLists]);
  
  // Handle successful login
  const handleLoginSuccess = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get current user after login
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      
      // Fetch data after login
      await Promise.all([fetchRecipes(), fetchLists()]);
      setAppInitialized(true);
    } catch (error) {
      console.error("Error after login:", error);
      setError(error.message || "Failed to load data after login");
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
    } catch (error) {
      console.error("Error logging out:", error);
      setError("Failed to log out");
    }
  };

  // Create a new recipe
  const createRecipe = async (e) => {
    e.preventDefault();
    if (!newRecipe.name || !newRecipe.ingredients) return;

    try {
      setLoading(true);
      const ingredientsArray = newRecipe.ingredients
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item !== "");

      const response = await databases.createDocument(
        DATABASE_ID,
        RECIPES_COLLECTION_ID,
        ID.unique(),
        {
          name: newRecipe.name,
          ingredients: ingredientsArray,
        }
      );

      setRecipes([...recipes, response]);
      setNewRecipe({ name: "", ingredients: "" });
      setLoading(false);
    } catch (error) {
      console.error("Error creating recipe:", error);
      setError("Failed to create recipe");
      setLoading(false);
    }
  };

  // Delete a recipe
  const deleteRecipe = async (recipeId) => {
    try {
      setLoading(true);
      await databases.deleteDocument(
        DATABASE_ID,
        RECIPES_COLLECTION_ID,
        recipeId
      );
      setRecipes(recipes.filter((recipe) => recipe.$id !== recipeId));
      setSelectedRecipes(selectedRecipes.filter((id) => id !== recipeId));
      setLoading(false);
    } catch (error) {
      console.error("Error deleting recipe:", error);
      setError("Failed to delete recipe");
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

  // Create a new shopping list from selected recipes
  const createShoppingList = async (e) => {
    e.preventDefault();
    if (!newListName || selectedRecipes.length === 0) return;

    try {
      setLoading(true);
      
      // Get all selected recipes
      const selectedRecipesData = recipes.filter((recipe) => 
        selectedRecipes.includes(recipe.$id)
      );
      
      // Extract and flatten all ingredients from selected recipes
      const allIngredients = [];
      selectedRecipesData.forEach((recipe) => {
        recipe.ingredients.forEach((ingredient) => {
          if (!allIngredients.includes(ingredient)) {
            allIngredients.push(ingredient);
          }
        });
      });

      // Create the shopping list document
      const response = await databases.createDocument(
        DATABASE_ID,
        LISTS_COLLECTION_ID,
        ID.unique(),
        {
          name: newListName,
          items: allIngredients,
        }
      );

      setLists([...lists, response]);
      setNewListName("");
      setSelectedRecipes([]);
      setActiveTab("lists");
      setLoading(false);
    } catch (error) {
      console.error("Error creating shopping list:", error);
      setError("Failed to create shopping list");
      setLoading(false);
    }
  };

  // Delete a shopping list
  const deleteList = async (listId) => {
    try {
      setLoading(true);
      await databases.deleteDocument(
        DATABASE_ID,
        LISTS_COLLECTION_ID,
        listId
      );
      setLists(lists.filter((list) => list.$id !== listId));
      if (currentList && currentList.$id === listId) {
        setCurrentList(null);
      }
      setLoading(false);
    } catch (error) {
      console.error("Error deleting shopping list:", error);
      setError("Failed to delete shopping list");
      setLoading(false);
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

  return (
    <div className="app-container">
      <header>
        <h1>Shopping List App</h1>
        {user && (
          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
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
                  <form onSubmit={createRecipe}>
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
                    <form onSubmit={createShoppingList}>
                      <div className="form-group">
                        <label htmlFor="list-name">List Name:</label>
                        <input
                          type="text"
                          id="list-name"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          required
                        />
                      </div>
                      <button type="submit" disabled={loading}>
                        {loading ? "Creating..." : "Create Shopping List"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

      {appInitialized && activeTab === "lists" && (
        <div className="lists-container">
          {currentList ? (
            <div className="list-detail">
              <div className="list-header">
                <button onClick={backToLists} className="back-btn">
                  &larr; Back
                </button>
                <h2>{currentList.name}</h2>
                <button
                  className="delete-btn"
                  onClick={() => deleteList(currentList.$id)}
                >
                  Delete List
                </button>
              </div>
              <div className="list-items">
                <h3>Items:</h3>
                {currentList.items.length === 0 ? (
                  <p>No items in this list.</p>
                ) : (
                  <ul>
                    {currentList.items.map((item, index) => (
                      <li key={index} className="list-item">
                        <input type="checkbox" id={`item-${index}`} />
                        <label htmlFor={`item-${index}`}>{item}</label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <>
              <h2>My Shopping Lists</h2>
              {loading ? (
                <p>Loading shopping lists...</p>
              ) : lists.length === 0 ? (
                <p>
                  No shopping lists found. Create a list from your recipes!
                </p>
              ) : (
                <ul className="lists-grid">
                  {lists.map((list) => (
                    <li key={list.$id} className="list-card">
                      <h3>{list.name}</h3>
                      <p>{list.items.length} items</p>
                      <div className="list-actions">
                        <button onClick={() => viewList(list)} className="view-btn">
                          View List
                        </button>
                        <button
                          onClick={() => deleteList(list.$id)}
                          className="delete-btn"
                        >
                          Delete
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
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
