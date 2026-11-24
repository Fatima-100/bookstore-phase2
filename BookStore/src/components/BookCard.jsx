import Icon from './Icon';

const formatDetails = {
  PDF: { label: 'PDF', action: 'Open PDF', icon: 'file' },
  UNICODE: { label: 'Unicode', action: 'Read text', icon: 'book' },
  AUDIO: { label: 'Audio', action: 'Listen now', icon: 'audio' },
};

export default function BookCard({ book, audioLocked, onLoginRequired }) {
  const format = formatDetails[book.bookType];

  return (
    <article className="book-card">
      <div className={`book-cover ${book.color}`}>
        <span className="cover-series">THE KITABGHAR COLLECTION</span>
        <span className="cover-category">{book.category}</span>
        <h3 dir="auto">{book.title}</h3>
        <span className="cover-ornament" aria-hidden="true">✳</span>
        <span className="cover-author" dir="auto">{book.author}</span>
        <span className="format-badge"><Icon name={format.icon} />{format.label}</span>
      </div>
      <div className="book-details">
        <p className="book-category">{book.category}</p>
        <h3 dir="auto">{book.title}</h3>
        <p className="book-subtitle">{book.subtitle}</p>
        <p className="book-author">{book.author}</p>
        {book.bookType === 'AUDIO' && audioLocked ? (
          <button type="button" className="book-action" onClick={onLoginRequired}>Log in to listen<Icon name="audio" /></button>
        ) : (
          <a className="book-action" href={book.fileUrl} target="_blank" rel="noopener noreferrer" aria-label={`${format.action}: ${book.subtitle} (opens external file in a new tab)`}>{format.action}<Icon name="external" /></a>
        )}
      </div>
    </article>
  );
}
