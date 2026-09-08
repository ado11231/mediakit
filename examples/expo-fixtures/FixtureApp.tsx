import { useEffect, useState } from 'react';
import { Linking, StatusBar, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import {
  createFixtureState,
  fixtureReadyId,
  readFixtureRequest,
  type FixtureRequest,
} from 'mediakit/fixtures';
import { Dashboard } from './Dashboard';

const fixtures = {
  default: { greeting: 'A little less scattered.', completed: 3, total: 5 },
  afternoon: { greeting: 'Small steps add up.', completed: 5, total: 5 },
};

export function FixtureApp() {
  const [request, setRequest] = useState<FixtureRequest>();
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    BrandRegular: require('../source-app/fonts/Geist-Regular.ttf'),
    BrandBold: require('../source-app/fonts/Geist-Bold.ttf'),
  });

  useEffect(() => {
    const open = (url: string) => {
      try {
        const next = readFixtureRequest(url);
        if (next.scene !== 'dashboard') throw new Error(`Unknown scene ${next.scene}`);
        setReady(false);
        setError(undefined);
        setRequest(next);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    };
    void Linking.getInitialURL().then((url) => {
      if (url) open(url);
    });
    const subscription = Linking.addEventListener('url', (event) => open(event.url));
    return () => subscription.remove();
  }, []);

  if (error || fontError) return <Text>{error ?? fontError?.message}</Text>;
  if (!request || !fontsLoaded) return <Text>Waiting for a fixture capture.</Text>;
  const data = createFixtureState(fixtures, request);
  return (
    <View
      key={`${request.scene}:${request.fixture}`}
      style={{ flex: 1 }}
      onLayout={() => setReady(true)}
    >
      <StatusBar hidden />
      <Dashboard data={data} />
      {ready && (
        <View
          testID={fixtureReadyId(request)}
          accessible
          accessibilityLabel="Fixture ready"
          style={{ position: 'absolute', width: 1, height: 1, top: 1, left: 1 }}
        />
      )}
    </View>
  );
}
