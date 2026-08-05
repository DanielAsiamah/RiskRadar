import { registerRootComponent } from 'expo';
import React from 'react';

import App from './App';
import { AuthProvider } from './auth/AuthProvider';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
function Root() {
  return React.createElement(
    AuthProvider,
    null,
    React.createElement(App),
  );
}

registerRootComponent(Root);
