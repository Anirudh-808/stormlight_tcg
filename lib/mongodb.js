
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGODB_URI is missing from .env.local");
}

const options = {};

let client;
let clientPromise;

if (process.env.NODE_ENV === "development") {
    if (!globalThis._mongoClientPromise) {
        client = new MongoClient(uri, options);
        globalThis._mongoClientPromise = client.connect();
    }

    clientPromise = globalThis._mongoClientPromise;
} else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
}

export default clientPromise;
