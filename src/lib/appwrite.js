import { Client, Account, Databases, ID } from "appwrite";

const client = new Client()
    .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
    .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

const account = new Account(client);
const databases = new Databases(client);

// Authentication helper functions
const authService = {
  // Get the current user if logged in
  getCurrentUser: async () => {
    try {
      return await account.get();
    } catch {
      return null;
    }
  },
  
  // Login with email and password
  login: async (email, password) => {
    try {
      return await account.createEmailPasswordSession(email, password);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  },
  
  // Register a new user
  register: async (email, password, name) => {
    try {
      const user = await account.create(ID.unique(), email, password, name);
      if (user) {
        // Auto login after successful registration
        await authService.login(email, password);
      }
      return user;
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  },
  
  // Logout the current user
  logout: async () => {
    try {
      return await account.deleteSession('current');
    } catch (error) {
      console.error("Logout error:", error);
      throw error;
    }
  }
};

export { client, account, databases, authService, ID };
