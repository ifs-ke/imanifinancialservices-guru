
// src/lib/mongodb.ts
// MongoDB and Prisma have been removed from this project.
// This file is kept to prevent import errors in existing files that might still reference it,
// but its functionality is disabled.

/**
 * @deprecated Database functionality has been removed. This function will throw an error.
 */
const connectToDatabase = async (): Promise<any> => {
  const errorMessage = 'Database functionality (MongoDB/Prisma) has been removed. Application now uses local storage only.';
  console.error(errorMessage);
  throw new Error(errorMessage);
};

export default connectToDatabase;
