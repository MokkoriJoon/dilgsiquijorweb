import { Eye } from 'lucide-react';

export default function PublicViewBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <Eye className="text-blue-600" size={20} />
      </div>
      <div>
        <h3 className="text-blue-800 font-semibold text-sm">Public Viewing Mode</h3>
        <p className="text-blue-600 text-sm mt-0.5">
          You are viewing the dashboard in read-only mode. Task details and completion actions are only available to authenticated staff.
        </p>
      </div>
    </div>
  );
}
