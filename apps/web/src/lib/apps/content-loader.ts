export type ContentLoader = {
  load(): Promise<string>;
};

export type ContentSource =
  | { source: 'user'; htmlContent: string }
  | { source: 'built-in'; contentUrl: string };

export function createBuiltInLoader(url: string): ContentLoader {
  return {
    load(): Promise<string> {
      if (url === '') return Promise.reject(new Error('built-in 앱 contentUrl이 없습니다'));
      return fetch(url).then((r) => {
        if (!r.ok) throw new Error(`fetch 실패: ${r.status} ${r.statusText}`);
        return r.text();
      });
    },
  };
}

export function createUserLoader(htmlContent: string): ContentLoader {
  return {
    load(): Promise<string> {
      if (htmlContent === '') return Promise.reject(new Error('user 앱 htmlContent가 없습니다'));
      return Promise.resolve(htmlContent);
    },
  };
}

export function createContentLoader(src: ContentSource): ContentLoader {
  if (src.source === 'user') return createUserLoader(src.htmlContent);
  return createBuiltInLoader(src.contentUrl);
}
