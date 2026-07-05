import React from 'react';
import { Link } from 'react-router-dom';
import { Home, RotateCcw } from 'lucide-react';

const ErrorPage = ({
  code = 500,
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  showHomeButton = true,
  showRetryButton = false,
  onRetry
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">SG</span>
          </div>
          <p className="text-sm font-semibold text-primary-600 mb-1">{code}</p>
          <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
          <p className="text-gray-500 mt-2">{message}</p>
        </div>

        <div className="flex gap-3">
          {showRetryButton && (
            <button
              onClick={onRetry}
              className="flex-1 flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              <RotateCcw size={18} />
              Try Again
            </button>
          )}
          {showHomeButton && (
            <Link
              to="/"
              className={`flex-1 flex items-center justify-center gap-2 font-medium py-3 px-4 rounded-lg transition-colors ${
                showRetryButton
                  ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              <Home size={18} />
              Back to Dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
