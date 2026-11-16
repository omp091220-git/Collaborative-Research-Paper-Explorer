import ResearchWorkspace from '../research/ResearchWorkspace';

export default function PaperPdfViewer({
  paperId,
  paper,
  pdfUrl,
  className = '',
  onOpenDetails,
  onOpenDiscussions,
  onOpenSummaries,
  onOpenCollaborators,
  isBookmarked,
  onToggleBookmark,
}) {
  return (
    <ResearchWorkspace
      paperId={paperId || paper?.id}
      paper={paper}
      pdfUrl={pdfUrl}
      className={className}
      onOpenDetails={onOpenDetails}
      onOpenDiscussions={onOpenDiscussions}
      onOpenSummaries={onOpenSummaries}
      onOpenCollaborators={onOpenCollaborators}
      isBookmarked={isBookmarked}
      onToggleBookmark={onToggleBookmark}
    />
  );
}
