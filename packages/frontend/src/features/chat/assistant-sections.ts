export interface AssistantSection {
  title: string;
  content: string;
}

const SECTION_HEADING_PATTERN = /^##\s+(.+?)\s*$/;

export function parseAssistantSections(
  markdown: string,
): AssistantSection[] | null {
  const lines = markdown.split("\n");
  const sections: AssistantSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(SECTION_HEADING_PATTERN);
    if (headingMatch) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      }
      currentTitle = headingMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentTitle) {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  }

  return sections.length > 0 ? sections : null;
}
