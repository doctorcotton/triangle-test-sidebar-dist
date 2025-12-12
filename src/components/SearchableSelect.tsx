import React, { useEffect, useRef, useState } from 'react';
import { OptionMeta } from '../types';

interface SearchableSelectProps {
  options: OptionMeta[];
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder }) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const filtered = options.filter(
    (o) => o.name.toLowerCase().includes(search.toLowerCase()) || o.id.toLowerCase().includes(search.toLowerCase())
  );
  const selected = options.find((o) => o.id === value);
  const displayText = selected ? selected.name : value ? `${value}（未匹配）` : null;

  return (
    <div className="searchable-select" ref={ref}>
      <div className="searchable-select-trigger input" onClick={() => setOpen(!open)}>
        {displayText ? <span className={!selected && value ? 'unmatched' : ''}>{displayText}</span> : <span className="placeholder">{placeholder}</span>}
        <span className="arrow">▾</span>
      </div>
      {open && (
        <div className="searchable-select-dropdown">
          <input
            className="searchable-select-search"
            placeholder="搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
          <div className="searchable-select-options">
            <div
              className={`searchable-select-option ${!value ? 'selected' : ''}`}
              onClick={() => {
                onChange('');
                setOpen(false);
                setSearch('');
              }}
            >
              {placeholder}
            </div>
            {filtered.map((o) => (
              <div
                key={o.id}
                className={`searchable-select-option ${o.id === value ? 'selected' : ''}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                  setSearch('');
                }}
                title={o.id}
              >
                {o.name}
              </div>
            ))}
            {filtered.length === 0 && <div className="searchable-select-empty">无匹配项</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
