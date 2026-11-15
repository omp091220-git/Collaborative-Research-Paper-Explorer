import ResearchWorkspace from '../research/ResearchWorkspace';

export default function PaperPdfViewer({
  paperId,
  paper,
  pdfUrl,
  className = '',
}) {
  return (
    <ResearchWorkspace
      paperId={paperId || paper?.id}
      paper={paper}
      pdfUrl={pdfUrl}
      className={className}
    />
  );
}
