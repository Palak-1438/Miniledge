import type { CreateLoanInput, Loan, Summary } from '../types/api';
import { http } from './client';

export async function fetchLoans(): Promise<Loan[]> {
  const { data } = await http.get<{ loans: Loan[] }>('/loans');
  return data.loans;
}

export async function fetchSummary(): Promise<Summary> {
  const { data } = await http.get<{ summary: Summary }>('/loans/summary');
  return data.summary;
}

export async function createLoan(input: CreateLoanInput): Promise<Loan> {
  const { data } = await http.post<{ loan: Loan }>('/loans', input);
  return data.loan;
}

export async function repayLoan(id: string): Promise<Loan> {
  const { data } = await http.patch<{ loan: Loan }>(`/loans/${id}/repay`);
  return data.loan;
}
