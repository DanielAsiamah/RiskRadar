import { Platform, StyleSheet } from 'react-native';

export const membershipColors = {
  navy: '#0f172a',
  slate: '#475569',
  muted: '#94a3b8',
  border: '#e2e8f0',
  indigo: '#4f46e5',
  indigoDark: '#3730a3',
  indigoSoft: '#eef2ff',
  emerald: '#059669',
  amber: '#d97706',
  rose: '#e11d48',
  white: '#ffffff',
};

export const membershipStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: membershipColors.white,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: membershipColors.border,
    borderRadius: 28,
    backgroundColor: membershipColors.white,
    padding: 22,
  },
  elevatedCard: {
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(15, 23, 42, 0.08)',
      },
      default: {
        shadowColor: membershipColors.navy,
        shadowOpacity: 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 3,
      },
    }),
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: membershipColors.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: membershipColors.border,
    backgroundColor: membershipColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
});
