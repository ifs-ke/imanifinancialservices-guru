import React from 'react';

export default function Script({
  src,
  dangerouslySetInnerHTML,
  id,
}: {
  src?: string;
  dangerouslySetInnerHTML?: { __html: string };
  id?: string;
  strategy?: string;
}) {
  React.useEffect(() => {
    if (src) {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      if (id) script.id = id;
      document.body.appendChild(script);
      return () => {
        if (script.parentNode) script.parentNode.removeChild(script);
      };
    } else if (dangerouslySetInnerHTML?.__html) {
      const script = document.createElement('script');
      if (id) script.id = id;
      script.innerHTML = dangerouslySetInnerHTML.__html;
      document.body.appendChild(script);
      return () => {
        if (script.parentNode) script.parentNode.removeChild(script);
      };
    }
  }, [src, dangerouslySetInnerHTML, id]);

  return null;
}
