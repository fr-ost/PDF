/** The developer's photo and a link to their website (both packaged/opened locally; nothing is fetched). */
import type { ReactNode } from 'react';
import { DEVELOPER } from '../services/support/support';
import { cn } from '../utils/cn';

export function DeveloperPhoto({ size, alt = '', className }: { size: number; alt?: string; className?: string }) {
  return <img src={DEVELOPER.photo} alt={alt} width={size} height={size} style={{ width: size, height: size }} className={cn('shrink-0 rounded-full object-cover', className)} draggable={false} />;
}

export function DeveloperLink({ className, children, testId }: { className?: string; children?: ReactNode; testId?: string }) {
  return (
    <a href={DEVELOPER.website} target="_blank" rel="noopener noreferrer" title={DEVELOPER.websiteLabel} className={className} data-testid={testId}>
      {children ?? DEVELOPER.name}
    </a>
  );
}
