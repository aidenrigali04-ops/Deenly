import { ActionSheetIOS, Alert, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { DocumentPickerAsset } from "expo-document-picker";

/** Post/reel: main media. Product: cover-style image/video (e.g. delivery file). */
export type VisualPickProfile =
  | { kind: "post" }
  | { kind: "reel" }
  | { kind: "product" };

const CANCEL = "Cancel";

function imagePickerAssetToDocumentAsset(asset: ImagePicker.ImagePickerAsset): DocumentPickerAsset {
  const isVideo = asset.type === "video" || asset.mimeType?.startsWith("video/");
  const mimeType = asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
  const name =
    asset.fileName || (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`);
  return {
    uri: asset.uri,
    name,
    mimeType,
    size: asset.fileSize,
    lastModified: Date.now()
  };
}

async function pickFromLibrary(profile: VisualPickProfile): Promise<DocumentPickerAsset | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    return null;
  }
  const mediaTypes =
    profile.kind === "reel"
      ? ImagePicker.MediaTypeOptions.Videos
      : ImagePicker.MediaTypeOptions.All;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsEditing: false,
    quality: 1,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High
  });
  if (result.canceled || !result.assets?.length) {
    return null;
  }
  return imagePickerAssetToDocumentAsset(result.assets[0]);
}

async function pickFromCamera(profile: VisualPickProfile): Promise<DocumentPickerAsset | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    return null;
  }
  const mediaTypes =
    profile.kind === "reel"
      ? ImagePicker.MediaTypeOptions.Videos
      : ImagePicker.MediaTypeOptions.All;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes,
    allowsEditing: false,
    quality: 1,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.High
  });
  if (result.canceled || !result.assets?.length) {
    return null;
  }
  return imagePickerAssetToDocumentAsset(result.assets[0]);
}

async function pickFromFiles(profile: VisualPickProfile): Promise<DocumentPickerAsset | null> {
  const type = profile.kind === "reel" ? "video/*" : ["image/*", "video/*"];
  const result = await DocumentPicker.getDocumentAsync({
    type,
    copyToCacheDirectory: true
  });
  if (result.canceled || !result.assets.length) {
    return null;
  }
  return result.assets[0];
}

/**
 * Shows library / camera / files so each path uses the matching system UI (Photos vs Files).
 */
export function pickVisualMedia(
  profile: VisualPickProfile,
  onResult: (asset: DocumentPickerAsset | null) => void
): void {
  const isReel = profile.kind === "reel";
  const libraryLabel = "Choose from library";
  const captureLabel = isReel ? "Record video" : "Take photo or video";
  const filesLabel = "Choose from files";
  const options = [libraryLabel, captureLabel, filesLabel, CANCEL];
  const cancelButtonIndex = 3;

  const run = async (index: number) => {
    if (index === cancelButtonIndex || index < 0) {
      return;
    }
    let asset: DocumentPickerAsset | null = null;
    try {
      if (index === 0) {
        asset = await pickFromLibrary(profile);
      } else if (index === 1) {
        asset = await pickFromCamera(profile);
      } else if (index === 2) {
        asset = await pickFromFiles(profile);
      }
    } catch {
      asset = null;
    }
    onResult(asset);
  };

  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        userInterfaceStyle: "light"
      },
      (i) => {
        void run(i);
      }
    );
  } else {
    Alert.alert("Add media", "Where should we get this from?", [
      { text: libraryLabel, onPress: () => void run(0) },
      { text: captureLabel, onPress: () => void run(1) },
      { text: filesLabel, onPress: () => void run(2) },
      { text: CANCEL, style: "cancel" }
    ]);
  }
}
