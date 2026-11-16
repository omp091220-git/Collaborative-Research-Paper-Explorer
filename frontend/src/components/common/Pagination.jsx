import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  pageSize = 10,
  onPageChange,
}) {
  if (totalPages <= 1) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-5 border-t border-white/[0.08] text-xs text-[#A1A1B5] font-medium">
      <div>
        Showing <span className="font-bold text-[#F8FAFC]">{start}</span> to{' '}
        <span className="font-bold text-[#F8FAFC]">{end}</span> of{' '}
        <span className="font-bold text-[#F8FAFC]">{totalItems}</span> results
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          iconLeft={ChevronLeft}
        >
          Previous
        </Button>

        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((page) => {
            if (totalPages <= 7) return true;
            if (page === 1 || page === totalPages) return true;
            return Math.abs(page - currentPage) <= 1;
          })
          .map((page, idx, arr) => {
            const prev = arr[idx - 1];
            const showEllipsis = prev && page - prev > 1;

            return (
              <span key={page} className="flex items-center">
                {showEllipsis && (
                  <span className="px-1.5 text-[#71758B] font-bold">...</span>
                )}
                <button
                  onClick={() => onPageChange(page)}
                  className={`w-7 h-7 text-xs rounded-lg font-bold transition cursor-pointer ${
                    currentPage === page
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-600/30 font-extrabold'
                      : 'text-[#A1A1B5] hover:text-[#F8FAFC] hover:bg-white/10'
                  }`}
                >
                  {page}
                </button>
              </span>
            );
          })}

        <Button
          variant="outline"
          size="xs"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          iconRight={ChevronRight}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
