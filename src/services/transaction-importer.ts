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
  /**
   * The mode of payment used for the transaction.
   * Optional for now, as the import logic needs to determine this.
   */
  modeOfPayment?: 'Cash' | 'Bank' | 'Mpesa';
}

/**
 * Asynchronously imports financial transactions from a file.
 *
 * @param file The file to import transactions from.
 * @returns A promise that resolves to an array of Transaction objects.
 */
export async function importTransactions(file: File): Promise<Transaction[]> {
  // TODO: Implement this by calling an API or parsing the file locally.
  // This implementation should ideally parse the file content (CSV, XLSX, OFX, QIF)
  // and map the columns to the Transaction interface fields, including attempting
  // to infer the modeOfPayment if possible, or setting it to undefined/default.

  console.log(`Simulating import for file: ${file.name}`);
  // Simulate network delay or processing time
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Return example data for now. Replace with actual parsed data.
  return [
    {
      date: new Date(),
      description: 'Example Imported Transaction',
      amount: -25.00,
      modeOfPayment: 'Bank', // Example default for imported
    },
  ];
}
