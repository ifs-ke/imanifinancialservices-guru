// src/lib/mongodb.ts
import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('Please define the MONGODB_URI environment variable inside .env');
}

// Define MongoClientOptions with specific settings
const options = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

const connectToDatabase = async (): Promise<MongoClient> => {
  if (process.env.NODE_ENV === 'development') {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>
    };

    if (!globalWithMongo._mongoClientPromise) {
      client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
      console.log("Creating new MongoDB connection (development).");
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    if (!clientPromise) {
       client = new MongoClient(uri, options);
       clientPromise = client.connect();
       console.log("Creating new MongoDB connection (production).");
    }
  }
  // clientPromise will be cached and reused.
  return clientPromise;
};

export default connectToDatabase;
