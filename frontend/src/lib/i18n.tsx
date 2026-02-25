"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

export type Language = "en" | "zh";

const STORAGE_KEY = "mc_ui_language";

interface LanguageContextValue {
    language: Language;
    toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
    language: "en",
    toggleLanguage: () => { },
});

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>("en");

    // Hydrate from localStorage on mount (client-side only)
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "zh" || stored === "en") {
            setLanguage(stored);
        }
    }, []);

    const toggleLanguage = useCallback(() => {
        setLanguage((prev) => {
            const next: Language = prev === "en" ? "zh" : "en";
            localStorage.setItem(STORAGE_KEY, next);
            return next;
        });
    }, []);

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage(): LanguageContextValue {
    return useContext(LanguageContext);
}
