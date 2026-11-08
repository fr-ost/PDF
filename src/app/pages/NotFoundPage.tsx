import { FileQuestion } from 'lucide-react';
import { EmptyState } from '../../components/ui/Feedback';

export function NotFoundPage() {
  return (
    <EmptyState icon={FileQuestion} title="Page not found" headingLevel={1} action={<a className="text-sm font-medium text-primary hover:underline" href="#/">Go to home</a>}>
      The page you were looking for doesn’t exist.
    </EmptyState>
  );
}
