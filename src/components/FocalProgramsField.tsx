import { useState } from 'react';
import { Plus, X } from 'lucide-react';

export default function FocalProgramsField({
  isFocalPerson,
  programs,
  onFocalPersonChange,
  onProgramsChange,
}: {
  isFocalPerson: boolean;
  programs: string[];
  onFocalPersonChange: (value: boolean) => void;
  onProgramsChange: (value: string[]) => void;
}) {
  const [programInput, setProgramInput] = useState('');

  function addProgram() {
    const program = programInput.trim();
    if (!program || programs.some((item) => item.toLocaleLowerCase() === program.toLocaleLowerCase())) return;
    onProgramsChange([...programs, program]);
    setProgramInput('');
  }

  function removeProgram(index: number) {
    onProgramsChange(programs.filter((_, programIndex) => programIndex !== index));
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
        <input
          type="checkbox"
          checked={isFocalPerson}
          onChange={(event) => onFocalPersonChange(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Focal Person
      </label>
      {isFocalPerson && (
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-gray-600">Programs handled</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={programInput}
              onChange={(event) => setProgramInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addProgram();
                }
              }}
              placeholder="Enter a program"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={addProgram}
              disabled={!programInput.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={15} /> Add
            </button>
          </div>
          {programs.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {programs.map((program, index) => (
                <li
                  key={`${program.toLocaleLowerCase()}-${index}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-xs text-blue-800"
                >
                  <span className="break-words">{program}</span>
                  <button
                    type="button"
                    onClick={() => removeProgram(index)}
                    aria-label={`Remove ${program}`}
                    className="flex-shrink-0 rounded-full p-0.5 text-blue-500 hover:bg-blue-50 hover:text-blue-800"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-gray-500">
            These programs are publicly visible in this person's organizational chart details.
          </p>
        </div>
      )}
    </section>
  );
}
