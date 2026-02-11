import React from 'react';
import { requireNativeComponent } from 'react-native';

const NativeBioVaultCameraView = requireNativeComponent('BioVaultCameraView');

export const BioVaultCameraView = (props) => {
  return <NativeBioVaultCameraView {...props} />;
};
