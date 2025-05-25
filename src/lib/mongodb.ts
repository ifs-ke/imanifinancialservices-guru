
// src/lib/mongodb.ts
// MongoDB has been removed from this project.
// This file is kept to prevent import errors but its functionality is disabled.

/**
 * @deprecated MongoDB is no longer used in this project. This function will throw an error.
 */
const connectToDatabase = async (): Promise<any> => {
  const errorMessage = 'MongoDB has been removed from this project. Database functionality is disabled.';
  console.error(errorMessage);
  throw new Error(errorMessage);
};

export default connectToDatabase;
