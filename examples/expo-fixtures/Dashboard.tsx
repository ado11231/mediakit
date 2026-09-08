import { StyleSheet, Text, View } from 'react-native';
import { theme } from './theme';

export interface DashboardData {
  greeting: string;
  completed: number;
  total: number;
}

export function Dashboard({ data }: { data: DashboardData }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>daybook</Text>
      <Text style={styles.title}>{data.greeting}</Text>
      <View style={styles.progress}>
        <Text style={styles.number}>
          {data.completed} / {data.total}
        </Text>
        <Text style={styles.body}>little steps, real progress</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 28, paddingTop: 100, backgroundColor: theme.background },
  brand: { fontFamily: 'BrandBold', fontSize: 18, color: theme.text, marginBottom: 40 },
  title: { fontFamily: 'BrandBold', fontSize: 38, color: theme.text },
  progress: { backgroundColor: theme.accent, borderRadius: 24, padding: 28, marginTop: 32 },
  number: { fontFamily: 'BrandBold', fontSize: 52, color: theme.text },
  body: { fontFamily: 'BrandRegular', fontSize: 16, color: theme.text, marginTop: 12 },
});
