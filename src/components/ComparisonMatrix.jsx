'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaExchangeAlt, FaStar, FaFilePdf, FaFileWord, FaFilePowerpoint } from 'react-icons/fa';
import Image from 'next/image';
import { useComparison } from '@/hooks/useComparison';

export default function ComparisonMatrix() {
  const {
    comparedItems,
    isModalOpen,
    removeFromComparison,
    closeComparisonModal,
  } = useComparison();

  if (comparedItems.length === 0) return null;

  const getFileIcon = (fileName = '') => {
    const ext = fileName.split('.').pop().toLowerCase();
    switch (ext) {
      case 'pdf':
        return <FaFilePdf className="text-red-500 w-4 h-4" />;
      case 'doc':
      case 'docx':
        return <FaFileWord className="text-blue-500 w-4 h-4" />;
      case 'ppt':
      case 'pptx':
        return <FaFilePowerpoint className="text-amber-500 w-4 h-4" />;
      default:
        return <FaFilePdf className="text-indigo-500 w-4 h-4" />;
    }
  };

  const getFormatLabel = (fileName = '') => {
    const ext = fileName.split('.').pop().toUpperCase();
    return ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX'].includes(ext) ? ext : 'PDF';
  };

  return (
    <>
      {/* ────────────────── SIDE-BY-SIDE MATRIX MODAL OVERLAY ────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950 backdrop-blur-sm"
              onClick={closeComparisonModal}
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden z-10"
            >
              {/* Modal Header */}
              <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500 text-white rounded-lg shadow-sm">
                    <FaExchangeAlt />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-bold text-slate-800 dark:text-slate-100">
                      Educational Resource Comparison Matrix
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Contrast notes, details, format, and costs side-by-side to make the best learning choice.
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeComparisonModal}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Close Comparison"
                >
                  <FaTimes className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body / Table Scroll Container */}
              <div className="flex-1 overflow-x-auto overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
                {/* Responsive Grid with Mobile Horizontal Scroll support */}
                <table className="w-full border-collapse text-left min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800">
                      {/* Metric name column */}
                      <th className="py-4 pr-4 font-bold text-sm text-slate-400 uppercase tracking-wider w-[180px]">
                        Details
                      </th>
                      {/* Item columns */}
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        return (
                          <th key={itemId} className="py-4 px-4 font-semibold text-sm w-[260px]">
                            <div className="flex flex-col gap-3 relative group">
                              <div className="relative w-full h-32 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 dark:border-slate-800 shadow-sm">
                                <Image
                                  src={item.image || item.thumbnailUrl || '/images/image1.jpg'}
                                  alt={item.title}
                                  fill
                                  className="object-cover"
                                />
                                <button
                                  onClick={() => removeFromComparison(itemId)}
                                  className="absolute top-2 right-2 bg-slate-900/80 hover:bg-rose-600 text-white rounded-full p-1.5 transition-all opacity-0 group-hover:opacity-100 shadow"
                                  title="Remove item"
                                >
                                  <FaTimes className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="h-12 overflow-hidden flex flex-col justify-start">
                                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-tight">
                                  {item.title}
                                </h4>
                                <span className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                                  by {item.author || 'Anonymous'}
                                </span>
                              </div>
                            </div>
                          </th>
                        );
                      })}
                      {/* Fill space if less than 3 */}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <th key={i} className="py-4 px-4 w-[260px]">
                            <div className="h-44 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-400 font-medium">
                              Select a material to add
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150 dark:divide-slate-800/80">
                    {/* ROW: PRICE */}
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 pr-4 text-xs font-bold text-slate-500 uppercase">
                        Price
                      </td>
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        return (
                          <td key={itemId} className="py-4 px-4">
                            <span className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-extrabold text-sm px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-800/50">
                              {item.price} <span className="text-[10px] font-bold text-blue-500">XLM</span>
                            </span>
                          </td>
                        );
                      })}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <td key={i} className="py-4 px-4 text-slate-300">—</td>
                        ))}
                    </tr>

                    {/* ROW: RATING */}
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 pr-4 text-xs font-bold text-slate-500 uppercase">
                        Rating
                      </td>
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        const rating = item.rating || 4.8;
                        const likes = item.likes || 0;
                        return (
                          <td key={itemId} className="py-4 px-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1">
                                <FaStar className="text-amber-400 w-4 h-4" />
                                <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">
                                  {rating.toFixed(1)}
                                </span>
                                <span className="text-xs text-slate-400 font-medium">/ 5.0</span>
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold uppercase">
                                {likes} recommendation likes
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <td key={i} className="py-4 px-4 text-slate-300">—</td>
                        ))}
                    </tr>

                    {/* ROW: SUBJECT */}
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 pr-4 text-xs font-bold text-slate-500 uppercase">
                        Subject
                      </td>
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        return (
                          <td key={itemId} className="py-4 px-4">
                            <span className="inline-flex items-center bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold text-xs px-2.5 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/30">
                              {item.subject || 'Academics'}
                            </span>
                          </td>
                        );
                      })}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <td key={i} className="py-4 px-4 text-slate-300">—</td>
                        ))}
                    </tr>

                    {/* ROW: FILE FORMAT */}
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 pr-4 text-xs font-bold text-slate-500 uppercase">
                        File Format
                      </td>
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        return (
                          <td key={itemId} className="py-4 px-4">
                            <div className="flex items-center gap-2">
                              {getFileIcon(item.storageKey || item.title)}
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                {getFormatLabel(item.storageKey || item.title)} Document
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <td key={i} className="py-4 px-4 text-slate-300">—</td>
                        ))}
                    </tr>

                    {/* ROW: LICENSING TERMS */}
                    <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="py-4 pr-4 text-xs font-bold text-slate-500 uppercase">
                        Licensing Terms
                      </td>
                      {comparedItems.map((item) => {
                        const itemId = item._id || item.id;
                        return (
                          <td key={itemId} className="py-4 px-4">
                            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium leading-relaxed max-w-[240px] italic">
                              &quot;{item.usageRights || 'Personal study access only. Not for resale or redistribution.'}&quot;
                            </p>
                          </td>
                        );
                      })}
                      {comparedItems.length < 3 &&
                        Array.from({ length: 3 - comparedItems.length }).map((_, i) => (
                          <td key={i} className="py-4 px-4 text-slate-300">—</td>
                        ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/30 flex justify-end gap-3">
                <button
                  onClick={closeComparisonModal}
                  className="px-5 py-2.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 rounded-xl transition-all"
                >
                  Close Contrast
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
