import { useLocale } from "../context/LocaleContext";

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <button type="button"
      onClick={() => setLocale(locale === "en" ? "zh" : "en")}
      className="secondary-button"
    >
      {locale === "en" ? "中文" : "EN"}
    </button>
  );
}
