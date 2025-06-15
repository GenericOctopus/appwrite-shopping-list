import { createRxDatabase, addRxPlugin } from 'rxdb/plugins/core';
import { getRxStorageLocalstorage } from 'rxdb/plugins/storage-localstorage';
import { replicateAppwrite } from 'rxdb/plugins/replication-appwrite';
import { Client, Databases, Account } from 'appwrite';

// Appwrite configuration
const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT;
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID;
const DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID;
const RECIPES_COLLECTION_ID = "6844cc0a001dfcce5baa";
const LISTS_COLLECTION_ID = "6844cf2e002c1b4ef233";

// Create Appwrite client
const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

const databases = new Databases(client);
const account = new Account(client);

// RxDB schemas
const recipeSchema = {
  title: 'recipe schema',
  version: 0,
  primaryKey: '$id',
  type: 'object',
  properties: {
    $id: {
      type: 'string',
      maxLength: 100
    },
    name: {
      type: 'string'
    },
    ingredients: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  required: ['$id', 'name', 'ingredients']
};

const listSchema = {
  title: 'list schema',
  version: 0,
  primaryKey: '$id',
  type: 'object',
  properties: {
    $id: {
      type: 'string',
      maxLength: 100
    },
    name: {
      type: 'string'
    },
    items: {
      type: 'array',
      items: {
        type: 'string'
      }
    }
  },
  required: ['$id', 'name', 'items']
};

// User session schema for offline authentication
const userSessionSchema = {
  title: 'user session schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      default: 'current'
    },
    userId: {
      type: 'string'
    },
    email: {
      type: 'string'
    },
    name: {
      type: 'string'
    },
    isLoggedIn: {
      type: 'boolean'
    },
    lastLoginTime: {
      type: 'number'
    }
  },
  required: ['id', 'isLoggedIn']
};

// Initialize RxDB
export async function initializeRxDB() {
  try {
    console.log('Initializing RxDB...');
    
    // Create RxDB database
    const db = await createRxDatabase({
      name: 'shoppingapp',
      storage: getRxStorageLocalstorage(),
    });
    
    console.log('RxDB database created');
    
    // Create collections
    await db.addCollections({
      recipes: {
        schema: recipeSchema
      },
      lists: {
        schema: listSchema
      },
      userSession: {
        schema: userSessionSchema
      }
    });
    
    console.log('RxDB collections created');
    
    // Set up replication with Appwrite
    let replication = {
      recipes: null,
      lists: null
    };
    
    try {
      // Check if user is logged in
      const currentUser = await account.get();
      
      if (currentUser) {
        console.log('Setting up replication for logged-in user');
        
        // Store user session for offline use
        await db.userSession.upsert({
          id: 'current',
          userId: currentUser.$id,
          email: currentUser.email,
          name: currentUser.name,
          isLoggedIn: true,
          lastLoginTime: Date.now()
        });
        
        // Set up replication for recipes
        replication.recipes = await replicateAppwrite({
          collection: db.recipes,
          appwriteClient: client,
          databaseId: DATABASE_ID,
          collectionId: RECIPES_COLLECTION_ID,
          pull: {
            batchSize: 50,
            realtimeOff: false
          },
          push: {
            batchSize: 10,
            realtimeOff: false
          },
          live: true,
          retryTime: 1000 * 5, // 5 seconds
          autoStart: true
        });
        
        // Set up replication for shopping lists
        replication.lists = await replicateAppwrite({
          collection: db.lists,
          appwriteClient: client,
          databaseId: DATABASE_ID,
          collectionId: LISTS_COLLECTION_ID,
          pull: {
            batchSize: 50,
            realtimeOff: false
          },
          push: {
            batchSize: 10,
            realtimeOff: false
          },
          live: true,
          retryTime: 1000 * 5, // 5 seconds
          autoStart: true
        });
        
        console.log('Replication set up successfully');
      } else {
        console.log('User not logged in, skipping replication setup');
      }
    } catch (error) {
      console.error('Error setting up replication:', error);
    }
    
    // Database service methods
    const dbService = {
      // Recipe methods
      getRecipes: async () => {
        const recipes = await db.recipes.find().exec();
        return recipes.map(doc => doc.toJSON());
      },
      
      getRecipe: async (id) => {
        const recipe = await db.recipes.findOne(id).exec();
        return recipe ? recipe.toJSON() : null;
      },
      
      createRecipe: async (recipeData) => {
        const recipe = await db.recipes.insert(recipeData);
        return recipe.toJSON();
      },
      
      updateRecipe: async (id, recipeData) => {
        const recipe = await db.recipes.findOne(id).exec();
        if (!recipe) return null;
        
        await recipe.update({
          $set: recipeData
        });
        
        return recipe.toJSON();
      },
      
      deleteRecipe: async (id) => {
        const recipe = await db.recipes.findOne(id).exec();
        if (recipe) {
          await recipe.remove();
          return true;
        }
        return false;
      },
      
      // Shopping list methods
      getLists: async () => {
        const lists = await db.lists.find().exec();
        return lists.map(doc => doc.toJSON());
      },
      
      getList: async (id) => {
        const list = await db.lists.findOne(id).exec();
        return list ? list.toJSON() : null;
      },
      
      createList: async (listData) => {
        const list = await db.lists.insert(listData);
        return list.toJSON();
      },
      
      updateList: async (id, listData) => {
        const list = await db.lists.findOne(id).exec();
        if (!list) return null;
        
        await list.update({
          $set: listData
        });
        
        return list.toJSON();
      },
      
      deleteList: async (id) => {
        const list = await db.lists.findOne(id).exec();
        if (list) {
          await list.remove();
          return true;
        }
        return false;
      },
      
      // User session methods
      getUserSession: async () => {
        const session = await db.userSession.findOne('current').exec();
        return session ? session.toJSON() : null;
      },
      
      setUserSession: async (userData) => {
        const sessionData = {
          id: 'current',
          ...userData,
          isLoggedIn: true,
          lastLoginTime: Date.now()
        };
        
        await db.userSession.upsert(sessionData);
        return sessionData;
      },
      
      clearUserSession: async () => {
        const session = await db.userSession.findOne('current').exec();
        if (session) {
          await session.update({
            $set: {
              isLoggedIn: false
            }
          });
        }
        return true;
      }
    };
    
    return {
      db,
      replication,
      dbService
    };
  } catch (error) {
    console.error('Error initializing RxDB:', error);
    throw error;
  }
}
