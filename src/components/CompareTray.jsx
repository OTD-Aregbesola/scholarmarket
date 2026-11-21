'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaExchangeAlt, FaTimes, FaTrash, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import Image from 'next/image';
import { useComparison } from '@/hooks/useComparison';
import { MAX_COMPARE } from '@/providers/ComparisonProvider';

/**
 * Floating tray that keeps the selected comparison materials visible while the
 * learner browses the marketplace. Rendered once from the root layout so its
 * state (owned by ComparisonProvider) survives navigation between pages.
 *
 * On small screens it collapses to a compact pill that expands on tap; on
 * medium screens and up the full tray is always visible.
 */
export default function CompareTray() {
  const {
    comparedItems,
    isModalOpen,
    removeFromComparison,
    clearComparison,
    openComparisonModal,
  } = useComparison();
  const [isExpanded, setIsExpanded] = useState(false);

  if (comparedItems.length === 0) return null;

  const count = comparedItems.length;
  const atLimit = count >= MAX_COMPARE;

  return (
    <AnimatePresence>
      {!isModalOpen && (
        <motion.div
          initial={{ y: 150, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 150, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className={
            isExpanded
              ? 'fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md px-4 py-4 md:px-6'
              : 'fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-2xl backdrop-blur-md rounded-full px-2 py-2 md:bottom-0 md:left-0 md:right-0 md:translate-x-0 md:border-t md:border-x-0 md:border-b-0 md:rounded-none md:px-6 md:py-4'
          }
        >
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Mobile collapsed pill */}
            {!isExpanded && (
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                aria-expanded="false"
                aria-controls="compare-tray-content"
                aria-label={`Expand comparison tray, ${count} of ${MAX_COMPARE} selected`}
                className="md:hidden flex items-center gap-2 px-3 text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <FaExchangeAlt className="text-blue-600 dark:text-blue-400" />
                <span>Compare {count}/{MAX_COMPARE}</span>
                <FaChevronUp className="text-slate-400" />
              </button>
            )}

            <div
              id="compare-tray-content"
              className={`${isExpanded ? 'flex' : 'hidden'} md:flex flex-col md:flex-row md:items-center justify-between gap-4 w-full`}
            >
              {/* Header with count and limit explanation */}
              <div className="flex items-center justify-between md:justify-start gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                    <FaExchangeAlt />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      Contrast Educational Materials
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Compare price, format, and details ({count} / {MAX_COMPARE} selected)
                    </p>
                    {atLimit && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Maximum of {MAX_COMPARE} reached. Remove one to add another.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  aria-label="Collapse comparison tray"
                  className="md:hidden text-slate-500 dark:text-slate-300 p-2"
                >
                  <FaChevronDown />
                </button>
              </div>

              {/* Selected material thumbnails with remove actions */}
              <div className="flex flex-wrap items-center gap-3">
                {comparedItems.map((item) => {
                  const itemId = item._id || item.id;
                  return (
                    <div
                      key={itemId}
                      className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 pl-2 pr-1.5 py-1 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-[180px] shrink-0"
                    >
                      <div className="relative w-6 h-6 rounded overflow-hidden bg-slate-100 shrink-0">
                        <Image
                          src={item.image || item.thumbnailUrl || '/images/image1.jpg'}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      </div>
                      <span className="truncate flex-1 pr-1" title={item.title}>{item.title}</span>
                      <button
                        type="button"
                        onClick={() => removeFromComparison(itemId)}
                        aria-label={`Remove ${item.title} from comparison`}
                        className="text-slate-400 hover:text-rose-500 p-0.5"
                      >
                        <FaTimes className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Tray-level actions */}
              <div className="flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={clearComparison}
                  aria-label="Clear all selected materials"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <FaTrash className="w-3 h-3" />
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={openComparisonModal}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/20 transition-all flex items-center gap-2"
                >
                  <FaExchangeAlt />
                  Compare now
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
