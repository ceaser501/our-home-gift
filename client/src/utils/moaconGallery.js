import { registerPlugin } from '@capacitor/core';

// 네이티브 플러그인 MoaconGallery(안드로이드 GalleryPlugin.java · 아이폰 GalleryPlugin.swift).
//
// 사진첩 훑기(gallery.js)와 사진 저장(shareGifticon.js)이 같이 쓴다. 둘이 각자
// registerPlugin을 부르면 Capacitor가 "Cannot register plugins twice"를 찍는다 — 여기서
// 한 번만 등록하고 나눠 쓴다.
export const MoaconGallery = registerPlugin('MoaconGallery');
