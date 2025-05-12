// src/lib/mongodb.ts
import { MongoClient, ServerApiVersion } from 'mongodb';

const uri = process.env.MONGODB_URI;

if (!uri) {
  if (process.env.NODE_ENV !== 'production' || typeof process.env.BUILD_TIME !== 'undefined') { 
      // console.warn('MONGODB_URI environment variable is not defined. Database connectivity will fail.');
      throw new Error('Please define the MONGODB_URI environment variable inside .env');
  }
}

const options = {
  serverApi: {
    version: ServerApiVersion.v1, 
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 10, 
  minPoolSize: 1,
  connectTimeoutMS: 5000, 
  socketTimeoutMS: 30000, 
};


let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

const connectToDatabase = async (): Promise<MongoClient> => {
   if (!uri) {
       // console.error("MongoDB: Connection attempt failed - MONGODB_URI is not configured.");
       throw new Error('MongoDB URI is not configured. Please set the MONGODB_URI environment variable.');
   }

  if (process.env.NODE_ENV === 'development') {
    let globalWithMongo = global as typeof globalThis & {
      _mongoClientPromise?: Promise<MongoClient>
    };

    if (!globalWithMongo._mongoClientPromise) {
      try {
        client = new MongoClient(uri, options);
        globalWithMongo._mongoClientPromise = client.connect();
      } catch (error) {
        // console.error("MongoDB: Failed to create client (development):", error);
        globalWithMongo._mongoClientPromise = undefined;
        throw new Error("Failed to initialize MongoDB client."); 
      }
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    if (!clientPromise) {
       try {
           client = new MongoClient(uri, options);
           clientPromise = client.connect();
           // console.log("MongoDB: Establishing new connection (production)..."); 

           clientPromise.then(async (connectedClient) => {
             try {
               const db = connectedClient.db();
               await db.command({
                 collMod: 'transactions',
                 validator: { $jsonSchema: { /* Define your transaction schema rules here */ } }
               });
                await db.command({
                 collMod: 'debts',
                 validator: { $jsonSchema: { /* Define your debt schema rules here */ } }
               });
               // console.log("MongoDB: Schema validation applied/checked.");
             } catch (validationError) {
               // console.error("MongoDB: Failed to apply schema validation:", validationError);
             }
           });

       } catch (error) {
           // console.error("MongoDB: Failed to create client (production):", error);
           clientPromise = null; 
           throw new Error("Failed to initialize MongoDB client."); 
       }
    }
  }

  try {
    const connectedClient = await clientPromise;
    await connectedClient.db("admin").command({ ping: 1 });
    // console.log("MongoDB: Connection successful and ping verified.");
    return connectedClient;
  } catch (error) {
    // console.error("MongoDB: Connection or ping verification failed:", error);
    clientPromise = null;
    if (process.env.NODE_ENV === 'development') {
        (global as any)._mongoClientPromise = null;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to MongoDB. ${errorMessage}`); 
  }
};

export default connectToDatabase;
