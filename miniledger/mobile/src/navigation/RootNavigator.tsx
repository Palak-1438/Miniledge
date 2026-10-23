import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import AddLoanScreen from '../screens/AddLoanScreen';
import DashboardScreen from '../screens/DashboardScreen';
import LoginScreen from '../screens/LoginScreen';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Navigation only decides WHICH screens exist based on the auth status; it contains no business logic.
 * Because private screens are not registered while signed out, they cannot be reached (not even via
 * deep links or back navigation). Signing out/expiry swaps the stack back to Login automatically.
 */
export default function RootNavigator() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: colors.background } }}>
        {status === 'signedIn' ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
            <Stack.Screen
              name="AddLoan"
              component={AddLoanScreen}
              options={{
                title: 'Add New Loan',
                headerBackTitle: 'Back',
                headerTintColor: colors.primaryDark,
                headerStyle: { backgroundColor: colors.background },
                headerShadowVisible: false,
              }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
