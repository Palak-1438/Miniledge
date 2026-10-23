export const colors = {
  background: '#F6F8F7',
  card: '#FFFFFF',
  text: '#10201A',
  textMuted: '#5B6B64',
  border: '#E1E8E4',
  primary: '#1F7A4D',
  primaryDark: '#165C39',
  primarySoft: '#E3F4EA',
  danger: '#C62828',
  dangerSoft: '#FDEAEA',
  warningSoft: '#FFF4DB',
  warningText: '#8A5A00',
  white: '#FFFFFF',
  disabled: '#B8C4BE',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };

export const font = {
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  small: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
};

export const shadow = {
  shadowColor: '#0B2A1D',
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};
