const { supabaseAdmin } = require('../config/supabase');

const listAllFiles = async (bucket, prefix = '') => {
  const { data, error } = await supabaseAdmin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return [];

  let files = [];
  for (const item of data) {
    if (item.id === null) {
      const nestedPrefix = prefix ? `${prefix}/${item.name}` : item.name;
      files = files.concat(await listAllFiles(bucket, nestedPrefix));
    } else {
      files.push(item);
    }
  }
  return files;
};

const getStorageStats = async (req, res) => {
  try {
    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    const files = await listAllFiles(bucket);
    const totalBytes = files.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);

    res.json({
      success: true,
      data: {
        storage: {
          total_bytes: totalBytes,
          file_count: files.length
        }
      }
    });
  } catch (error) {
    console.error('Get storage stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch storage stats' });
  }
};

module.exports = { getStorageStats };
