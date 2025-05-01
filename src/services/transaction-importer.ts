/**
 * Represents a financial transaction.
 */
export interface Transaction {
  /**
   * The date of the transaction.
   */
  date: Date;
  /**
   * A description of the transaction.
   */
  description: string;
  /**
   * The amount of the transaction.  Positive numbers indicate income, negative indicate expenses.
   */
  amount: number;
}

/**
 * Asynchronously imports financial transactions from a file.
 *
 * @param file The file to import transactions from.
 * @returns A promise that resolves to an array of Transaction objects.
 */
export async function importTransactions(file: File): Promise<Transaction[]> {
  // TODO: Implement this by calling an API.

  return [
    {
      date: new Date(),
      description: 'Example Transaction',
      amount: -25.00,
    },
  ];
}
