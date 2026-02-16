// Crypto polyfill — MUST be the very first import (ethers.js needs it)
import 'react-native-get-random-values';
// react-native-gesture-handler MUST be imported before navigation
import 'react-native-gesture-handler';
import {AppRegistry} from 'react-native';
import App from './App.full';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);
