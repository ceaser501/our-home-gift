import { CATEGORIES, STATUS_TABS } from '../constants';

export default function FilterBar({ search, onSearchChange, category, onCategoryChange, statusTab, onStatusTabChange }) {
  return (
    <div className="filter-bar">
      <div className="search-box">
        <span className="search-box__icon">🔍</span>
        <input
          type="search"
          placeholder="이름, 브랜드로 검색"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {search && (
          <button type="button" className="search-box__clear" onClick={() => onSearchChange('')} aria-label="검색어 지우기">
            ✕
          </button>
        )}
      </div>

      <div className="status-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`status-tab ${statusTab === tab.key ? 'is-active' : ''}`}
            onClick={() => onStatusTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="category-chips">
        <button
          type="button"
          className={`chip ${category === '' ? 'is-active' : ''}`}
          onClick={() => onCategoryChange('')}
        >
          전체
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            className={`chip ${category === cat.key ? 'is-active' : ''}`}
            onClick={() => onCategoryChange(cat.key)}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
