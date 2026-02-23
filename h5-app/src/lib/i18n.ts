import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
  fallbackLng: "en",
  supportedLngs: ["en", "zh-CN"],
  interpolation: { escapeValue: false },
  detection: { order: ["navigator", "localStorage"], caches: ["localStorage"] },
});

export default i18n;
