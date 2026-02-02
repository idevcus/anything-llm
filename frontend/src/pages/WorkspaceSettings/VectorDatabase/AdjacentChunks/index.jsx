import { useTranslation } from "react-i18next";

export default function AdjacentChunks({ workspace, setHasChanges }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex flex-col">
        <label htmlFor="adjacentChunks" className="block input-label">
          {t("vector-workspace.adjacentChunks.title")}
        </label>
        <p className="text-white text-opacity-60 text-xs font-medium py-1.5">
          {t("vector-workspace.adjacentChunks.description")}
          <br />
          <i>{t("vector-workspace.adjacentChunks.recommend")}</i>
        </p>
      </div>
      <input
        name="adjacentChunks"
        type="number"
        min={0}
        max={5}
        step={1}
        onWheel={(e) => e.target.blur()}
        defaultValue={workspace?.adjacentChunks ?? 0}
        className="border-none bg-theme-settings-input-bg text-white placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button active:outline-primary-button outline-none block w-full p-2.5 mt-2"
        placeholder="0"
        required={true}
        autoComplete="off"
        onChange={() => setHasChanges(true)}
      />
    </div>
  );
}
