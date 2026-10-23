export interface User {
  id: string;
  phone: string;
}

export interface Loan {
  id: string;
  friendName: string;
  /** Decimal string such as "1250.50" (never a float) */
  amount: string;
  /** YYYY-MM-DD */
  dueDate: string;
  isRepaid: boolean;
  repaidAt: string | null;
  createdAt: string;
  isOverdue: boolean;
}

export interface Summary {
  totalLent: string;
  totalRepaid: string;
  outstandingAmount: string;
  overdueAmount: string;
  totalLoans: number;
}

export interface CreateLoanInput {
  friendName: string;
  amount: string;
  dueDate: string;
}

export interface AuthResult {
  token: string;
  user: User;
}
