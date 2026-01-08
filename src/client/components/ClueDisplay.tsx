interface Props {
  speaker: string;
  text: string;
  eliminated?: { type: string; id: string };
  index: number;
}

export default function ClueDisplay({ speaker, text, eliminated, index }: Props) {
  return (
    <div className="clue-card" data-number={index}>
      <div className="clue-speaker">{speaker}</div>
      <div className="clue-text">"{text}"</div>
      {eliminated && (
        <div className="clue-eliminated">
          Eliminates {eliminated.type}: {eliminated.id}
        </div>
      )}
    </div>
  );
}
