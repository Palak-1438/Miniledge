import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Login: undefined;
  Dashboard: { notice?: string } | undefined;
  AddLoan: undefined;
};

export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>;
export type DashboardScreenProps = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;
export type AddLoanScreenProps = NativeStackScreenProps<RootStackParamList, 'AddLoan'>;

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- standard typed-navigation augmentation
    interface RootParamList extends RootStackParamList {}
  }
}
