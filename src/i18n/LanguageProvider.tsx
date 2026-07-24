"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  APP_LANGUAGE_STORAGE_KEY,
  isAppLanguage,
  translateInterfaceText,
  type AppLanguage,
} from "./translations";

interface LanguageContextValue {
  readonly language: AppLanguage;
  readonly setLanguage: (language: AppLanguage) => void;
  readonly translate: (source: string) => string;
}

const DEFAULT_LANGUAGE_CONTEXT: LanguageContextValue = {
  language: "en",
  setLanguage: () => undefined,
  translate: (source) => source,
};

const LanguageContext = createContext<LanguageContextValue>(
  DEFAULT_LANGUAGE_CONTEXT,
);
const TRANSLATED_ATTRIBUTES = [
  "aria-label",
  "placeholder",
  "title",
  "alt",
] as const;
const SKIP_TRANSLATION_SELECTOR =
  'script, style, code, pre, textarea, [translate="no"], [data-no-translate]';

function canTranslateTextNode(node: Text) {
  const parent = node.parentElement;
  return Boolean(parent && !parent.closest(SKIP_TRANSLATION_SELECTOR));
}

function pageTitle(pathname: string) {
  if (pathname === "/") return "Course Design";
  if (pathname.startsWith("/designs/local-spj-04/edit"))
    return "Customize a jump · Course Design";
  if (pathname.includes("/review")) return "Course Review · Course Design";
  if (pathname.startsWith("/designs")) return "Designs · Course Design";
  if (pathname.startsWith("/courses")) return "Courses · Course Design";
  if (pathname.startsWith("/lab")) return "Developer Lab · Course Design";
  return "Course Design";
}

function InterfaceTranslator({ language }: { readonly language: AppLanguage }) {
  const pathname = usePathname();
  const textOriginals = useRef(new WeakMap<Text, string>());
  const attributeOriginals = useRef(
    new WeakMap<Element, Map<string, string>>(),
  );

  useEffect(() => {
    const root = document.body;
    if (!root) return;

    const translateTextNode = (node: Text) => {
      if (!canTranslateTextNode(node)) return;
      const current = node.nodeValue ?? "";
      const knownOriginal = textOriginals.current.get(node);
      if (language === "en") {
        if (knownOriginal !== undefined && current !== knownOriginal)
          node.nodeValue = knownOriginal;
        return;
      }

      let original = knownOriginal;
      if (original === undefined) {
        original = current;
        textOriginals.current.set(node, original);
      } else {
        const expectedTranslation = translateInterfaceText(original, "nl");
        if (current !== original && current !== expectedTranslation) {
          original = current;
          textOriginals.current.set(node, original);
        }
      }
      const translated = translateInterfaceText(original, "nl");
      if (translated !== current) node.nodeValue = translated;
    };

    const translateElementAttributes = (element: Element) => {
      let originals = attributeOriginals.current.get(element);
      for (const attribute of TRANSLATED_ATTRIBUTES) {
        const current = element.getAttribute(attribute);
        if (current === null) continue;
        const knownOriginal = originals?.get(attribute);
        if (language === "en") {
          if (knownOriginal !== undefined && current !== knownOriginal)
            element.setAttribute(attribute, knownOriginal);
          continue;
        }

        let original = knownOriginal;
        if (original === undefined) {
          original = current;
          if (!originals) {
            originals = new Map();
            attributeOriginals.current.set(element, originals);
          }
          originals.set(attribute, original);
        } else {
          const expectedTranslation = translateInterfaceText(original, "nl");
          if (current !== original && current !== expectedTranslation) {
            original = current;
            originals?.set(attribute, original);
          }
        }
        const translated = translateInterfaceText(original, "nl");
        if (translated !== current) element.setAttribute(attribute, translated);
      }
    };

    const scan = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        translateTextNode(node as Text);
        return;
      }
      if (!(node instanceof Element)) return;
      if (node.matches(SKIP_TRANSLATION_SELECTOR)) return;
      translateElementAttributes(node);
      const walker = document.createTreeWalker(
        node,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      let child = walker.nextNode();
      while (child) {
        if (child.nodeType === Node.TEXT_NODE) translateTextNode(child as Text);
        else if (child instanceof Element) translateElementAttributes(child);
        child = walker.nextNode();
      }
    };

    scan(root);
    document.documentElement.lang = language;
    document.title = translateInterfaceText(pageTitle(pathname), language);

    const observer = new MutationObserver((mutations) => {
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") scan(mutation.target);
        if (
          mutation.type === "attributes" &&
          mutation.target instanceof Element
        )
          translateElementAttributes(mutation.target);
        for (const added of mutation.addedNodes) scan(added);
      }
      observer.observe(root, {
        attributes: true,
        attributeFilter: [...TRANSLATED_ATTRIBUTES],
        characterData: true,
        childList: true,
        subtree: true,
      });
    });
    observer.observe(root, {
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES],
      characterData: true,
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [language, pathname]);

  return null;
}

export function LanguageProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [language, updateLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (!isAppLanguage(saved)) return;
    queueMicrotask(() => updateLanguage(saved));
  }, []);

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    updateLanguage(nextLanguage);
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, nextLanguage);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      translate: (source) => translateInterfaceText(source, language),
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
      <InterfaceTranslator language={language} />
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
