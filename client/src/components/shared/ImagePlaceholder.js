import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { ImageOff, ImageIcon } from 'lucide-react';

// Placeholder for any future image usage (machine photos, attachments, etc.):
// shows a lightweight box while the image loads and a broken-image icon on
// error, so slow/failed image loads never leave a blank gap on mobile data.
const ImagePlaceholder = ({ src, alt, className, iconSize }) => {
  const [status, setStatus] = useState(src ? 'loading' : 'empty');

  if (status === 'empty' || status === 'error') {
    return (
      <div className={`flex items-center justify-center bg-gray-100 text-gray-300 ${className || ''}`}>
        <ImageOff size={iconSize} />
      </div>
    );
  }

  return (
    <div className={`relative bg-gray-100 ${className || ''}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 animate-pulse">
          <ImageIcon size={iconSize} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`w-full h-full object-cover ${status === 'loaded' ? '' : 'opacity-0'}`}
      />
    </div>
  );
};

ImagePlaceholder.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
  iconSize: PropTypes.number
};

ImagePlaceholder.defaultProps = {
  src: null,
  alt: '',
  className: 'w-full h-32 rounded-lg',
  iconSize: 24
};

export default ImagePlaceholder;
