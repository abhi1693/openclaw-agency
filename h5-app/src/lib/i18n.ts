import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";

// 默认语言为中文，支持切换到英文
void i18n.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
  fallbackLng: "zh-CN",
  supportedLngs: ["zh-CN", "en"],
  interpolation: { escapeValue: false },
  // 检测顺序：优先读取 localStorage 缓存，再用浏览器语言，默认中文
  detection: {
    order: ["localStorage", "navigator"],
    caches: ["localStorage"],
    lookupLocalStorage: "h5-lang",
  },
});

export default i18n;
