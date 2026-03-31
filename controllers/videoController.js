const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { VideoTip, VideoCategory, User, VideoReaction } = require('../models');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { ensureUploadDir, toUploadDbPath } = require('../config/uploadPaths');
ffmpeg.setFfmpegPath(ffmpegPath);

function buildPublicUrl(value, host) {
    if (!value) return null;
    if (value.startsWith('http://') || value.startsWith('https://')) {
        return value;
    }

    const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
    return `${host}/${normalized}`;
}

function buildCreatorLink(user) {
    if (!user) return '';
    if (user.facEbook) {
        const handle = String(user.facEbook).trim().replace(/^@/, '');
        return handle.startsWith('http') ? handle : `https://www.facebook.com/${handle}`;
    }
    if (user.instagram) {
        const handle = String(user.instagram).trim().replace(/^@/, '');
        return handle.startsWith('http') ? handle : `https://www.instagram.com/${handle}`;
    }
    if (user.twitter) {
        const handle = String(user.twitter).trim().replace(/^@/, '');
        return handle.startsWith('http') ? handle : `https://twitter.com/${handle}`;
    }
    if (user.tiktok) {
        const handle = String(user.tiktok).trim().replace(/^@/, '');
        return handle.startsWith('http') ? handle : `https://www.tiktok.com/@${handle}`;
    }
    return '';
}

function buildVideoShareUrl(host, videoId) {
    return `${host}/api/videos/share/${videoId}`;
}

async function resolveAuthenticatedUser(req) {
    if (req.user?.id) {
        return req.user;
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yourSecretKey');
        if (!decoded?.id) return null;
        return {
            id: decoded.id,
            role: decoded.role,
            email: decoded.email,
        };
    } catch (_) {
        return null;
    }
}

async function getReactionSummary(videoId) {
    const reactions = await VideoReaction.findAll({
        where: { video_id: videoId },
        attributes: ['reaction_type'],
    });

    let likes = 0;
    let dislikes = 0;
    for (const reaction of reactions) {
        if (reaction.reaction_type === 'dislike') {
            dislikes += 1;
        } else {
            likes += 1;
        }
    }

    return { likes, dislikes };
}

async function syncReactionCounts(video) {
    const summary = await getReactionSummary(video.id);
    video.likes_count = summary.likes;
    video.dislikes_count = summary.dislikes;
    await video.save();
    return summary;
}

function formatVideo(video, host) {
    const item = video.toJSON ? video.toJSON() : video;
    const creator = item.User || {};
    return {
        ...item,
        thumbnail: buildPublicUrl(item.thumbnail_url, host),
        thumbnail_url: buildPublicUrl(item.thumbnail_url, host),
        video_url: buildPublicUrl(item.video_url, host),
        creator_image: buildPublicUrl(item.creator_image, host),
        category_name: item.VideoCategory?.name || item.category_name || null,
        creator_name: item.creator_name || creator.full_name || 'Creator',
        creator_link: item.creator_link || buildCreatorLink(creator),
        likes_count: item.likes_count || 0,
        dislikes_count: item.dislikes_count || 0,
        shares_count: item.shares_count || 0,
        downloads_count: item.downloads_count || 0,
        share_url: buildVideoShareUrl(host, item.id),
    };
}

function buildVideoFilters(query = {}) {
    const whereClause = {};

    if (query.category_id) {
        whereClause.category_id = query.category_id;
    }

    if (query.content_source) {
        whereClause.content_source = query.content_source;
    }

    if (query.ebook_id) {
        whereClause.ebook_id = query.ebook_id;
    }

    if (query.search && String(query.search).trim()) {
        const searchTerm = `%${String(query.search).trim()}%`;
        whereClause[Op.or] = [
            { title: { [Op.like]: searchTerm } },
            { description: { [Op.like]: searchTerm } },
            { creator_name: { [Op.like]: searchTerm } },
        ];
    }

    return whereClause;
}

const videoController = {
    // ✅ Create a video tip
    async uploadVideo(req, res) {
        try {
            console.log("Uploading video...");
            const { title, description, category_id, creator_name, creator_link, content_source, ebook_id } = req.body;
            console.log("Request body:", req.body);

            const videoFile = req.files?.video_url?.[0];
            console.log("Uploaded file info:", videoFile);

            if (!videoFile) {
                console.log("No video file provided.");
                return res.status(400).json({ error: 'Video file required' });
            }

            if (!title || !category_id) {
                return res.status(400).json({ error: 'Title and category are required' });
            }

            let thumbnailPath = req.files?.thumbnail_image?.[0]?.path || null;
            const creatorImagePath = req.files?.creator_image?.[0]?.path || null;

            if (!thumbnailPath) {
                const thumbnailDir = ensureUploadDir('thumbnails');
                thumbnailPath = path.join(
                    thumbnailDir,
                    `${Date.now()}_thumbnail.png`
                );
                console.log("Thumbnail will be saved to:", thumbnailPath);

                try {
                    await new Promise((resolve, reject) => {
                        ffmpeg(videoFile.path)
                            .on('end', () => {
                                console.log("Thumbnail generated.");
                                resolve();
                            })
                            .on('error', (err) => {
                                console.error("FFmpeg error:", err);
                                reject(err);
                            })
                            .screenshots({
                                count: 1,
                                folder: path.dirname(thumbnailPath),
                                filename: path.basename(thumbnailPath),
                                size: '320x240',
                                timemarks: ['3']
                            });
                    });
                } catch (thumbnailError) {
                    console.error("Thumbnail generation failed, continuing without thumbnail:", thumbnailError);
                    thumbnailPath = null;
                }
            }

            const isAdminUpload = req.user.role === 'admin';
            const normalizedContentSource = isAdminUpload
                ? (content_source || 'feature_video')
                : 'ebook_clip';

            const video = await VideoTip.create({
                title,
                description,
                video_url: toUploadDbPath(videoFile.path),
                thumbnail_url: toUploadDbPath(thumbnailPath),
                category_id,
                uploaded_by: req.user.id,
                creator_image: toUploadDbPath(creatorImagePath),
                creator_name: creator_name || null,
                creator_link: creator_link || null,
                content_source: normalizedContentSource,
                ebook_id: ebook_id || null,
                is_approved: isAdminUpload,
            });

            console.log("Video record created:", video.toJSON());
            const fullVideo = await VideoTip.findByPk(video.id, {
                include: [VideoCategory, User],
            });
            const host = `${req.protocol}://${req.get('host')}`;

            res.status(201).json({
                message: req.user.role === 'admin'
                    ? 'Video uploaded successfully'
                    : 'Video uploaded and awaiting approval',
                video: formatVideo(fullVideo, host),
            });
        } catch (err) {
            console.error("Upload error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    // ✅ Get all approved videos or filter by category
    async getApprovedVideos(req, res) {
        try {
            console.log("Fetching approved videos...");
            const whereClause = {
                is_approved: true,
                ...buildVideoFilters(req.query),
            };

            if (req.query.category) {
                whereClause['$VideoCategory.name$'] = req.query.category;
                console.log("Filtering by category:", req.query.category);
            }

            const videos = await VideoTip.findAll({
                where: whereClause,
                include: [VideoCategory, User],
                order: [['createdAt', 'DESC']],
            });

            console.log(`Fetched ${videos.length} videos`);
            const host = `${req.protocol}://${req.get('host')}`;
            res.json(videos.map((video) => formatVideo(video, host)));
        } catch (err) {
            console.error("Get approved videos error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async getVideosForAdminReview(req, res) {
        try {
            const approvedParam = String(req.query.approved ?? 'false').toLowerCase();
            const isApproved = approvedParam == 'true';
            console.log(`Fetching admin review videos (approved=${isApproved})...`);

            const whereClause = {
                is_approved: isApproved,
                ...buildVideoFilters(req.query),
            };

            if (req.query.category) {
                whereClause['$VideoCategory.name$'] = req.query.category;
            }

            const videos = await VideoTip.findAll({
                where: whereClause,
                include: [VideoCategory, User],
                order: [['createdAt', 'DESC']],
            });

            const host = `${req.protocol}://${req.get('host')}`;
            res.json(videos.map((video) => formatVideo(video, host)));
        } catch (err) {
            console.error("Get admin review videos error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    // ✅ Approve a video (Admin)
    async approveVideo(req, res) {
        try {
            console.log("Approving video with ID:", req.params.id);
            const video = await VideoTip.findByPk(req.params.id);

            if (!video) {
                console.log("Video not found.");
                return res.status(404).json({ error: 'Video not found' });
            }

            video.is_approved = true;
            await video.save();

            console.log("Video approved:", video.toJSON());
            res.json({ message: 'Video approved', video });
        } catch (err) {
            console.error("Approve video error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    // ✅ Create category (Admin)
    async createCategory(req, res) {
        try {
            console.log("Creating category with data:", req.body);
            const { name, description } = req.body;
            const category = await VideoCategory.create({ name, description });

            console.log("Category created:", category.toJSON());
            res.status(201).json(category);
        } catch (err) {
            console.error("Create category error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async updateCategory(req, res) {
        try {
            const category = await VideoCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            const { name, description, is_active } = req.body;
            if (name !== undefined) category.name = name;
            if (description !== undefined) category.description = description;
            if (is_active !== undefined) category.is_active = is_active;

            await category.save();
            return res.json(category);
        } catch (err) {
            console.error("Update category error:", err);
            return res.status(500).json({ error: err.message });
        }
    },

    async deleteCategory(req, res) {
        try {
            const category = await VideoCategory.findByPk(req.params.id);
            if (!category) {
                return res.status(404).json({ error: 'Category not found' });
            }

            await category.destroy();
            return res.json({ message: 'Category deleted successfully' });
        } catch (err) {
            console.error("Delete category error:", err);
            return res.status(500).json({ error: err.message });
        }
    },

    // ✅ Get all categories
    async getCategories(req, res) {
        try {
            console.log("Fetching all active categories...");
            const categories = await VideoCategory.findAll({ where: { is_active: true } });

            console.log(`Fetched ${categories.length} categories`);
            res.json(categories);
        } catch (err) {
            console.error("Get categories error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    // User deletes their own video
    async deleteVideo(req, res) {
        try {
            console.log("Attempting to delete video with ID:", req.params.id);
            const video = await VideoTip.findByPk(req.params.id);

            if (!video) {
                console.log("Video not found.");
                return res.status(404).json({ error: 'Video not found' });
            }

            if (video.uploaded_by !== req.user.id) {
                console.log("User not authorized to delete this video.");
                return res.status(403).json({ error: 'Not allowed' });
            }

            await video.destroy();
            console.log("Video deleted.");
            res.json({ message: 'Video deleted successfully' });
        } catch (err) {
            console.error("Delete video error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async rejectVideo(req, res) {
        try {
            console.log("Rejecting video with ID:", req.params.id);
            const video = await VideoTip.findByPk(req.params.id);

            if (!video) {
                console.log("Video not found.");
                return res.status(404).json({ error: 'Video not found' });
            }

            await video.destroy(); // Or flag with `is_rejected`
            console.log("Video rejected and removed.");
            res.json({ message: 'Video rejected and removed' });
        } catch (err) {
            console.error("Reject video error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async getRandomApprovedVideo(req, res) {
        try {
            console.log("🎥 Fetching random approved video...");
            const whereClause = {
                is_approved: true,
                ...buildVideoFilters(req.query),
            };
            const count = await VideoTip.count({ where: whereClause });

            if (count === 0) {
                return res.status(404).json({ error: 'No approved videos found' });
            }

            const randomOffset = Math.floor(Math.random() * count);

            const video = await VideoTip.findOne({
                where: whereClause,
                offset: randomOffset,
                limit: 1,
                include: [VideoCategory, User]
            });

            if (!video) {
                return res.status(404).json({ error: 'No video found at random index' });
            }

            const host = `${req.protocol}://${req.get('host')}`;
            const fullVideo = formatVideo(video, host);

            console.log('✅ Random video fetched');
            return res.status(200).json(fullVideo);
        } catch (err) {
            console.error("❌ Error fetching random video:", err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getRandomVideos(req, res) {
        try {
            const whereClause = {
                is_approved: true,
                ...buildVideoFilters(req.query),
            };
            const count = await VideoTip.count({ where: whereClause });
            const limit = parseInt(req.query.limit) || 4;
            const randomOffset = Math.max(0, Math.floor(Math.random() * Math.max(1, count - limit)));

            const videos = await VideoTip.findAll({
                where: whereClause,
                include: [VideoCategory, User],
                offset: randomOffset,
                limit,
            });

            const host = `${req.protocol}://${req.get('host')}`;
            return res.json(videos.map((video) => formatVideo(video, host)));
        } catch (err) {
            console.error("Error fetching random videos:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async getVideoById(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id, {
                include: [VideoCategory, User],
            });

            if (!video || !video.is_approved) {
                return res.status(404).json({ error: 'Video not found' });
            }

            const authUser = await resolveAuthenticatedUser(req);
            const host = `${req.protocol}://${req.get('host')}`;
            let currentReaction = null;

            if (authUser?.id) {
                const reaction = await VideoReaction.findOne({
                    where: {
                        user_id: authUser.id,
                        video_id: video.id,
                    },
                });
                currentReaction = reaction?.reaction_type || null;
            }

            return res.json({
                ...formatVideo(video, host),
                current_reaction: currentReaction,
            });
        } catch (err) {
            console.error('Get video by id error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async likeVideo(req, res) {
        return videoController.reactToVideo(req, res, 'like');
    },

    async dislikeVideo(req, res) {
        return videoController.reactToVideo(req, res, 'dislike');
    },

    async reactToVideo(req, res, reactionType) {
        try {
            const video = await VideoTip.findByPk(req.params.id);
            if (!video || !video.is_approved) {
                return res.status(404).json({ error: 'Video not found' });
            }

            const existingReaction = await VideoReaction.findOne({
                where: {
                    user_id: req.user.id,
                    video_id: video.id,
                },
            });

            let currentReaction = reactionType;

            if (existingReaction) {
                if (existingReaction.reaction_type === reactionType) {
                    await existingReaction.destroy();
                    currentReaction = null;
                } else {
                    existingReaction.reaction_type = reactionType;
                    await existingReaction.save();
                }
            } else {
                await VideoReaction.create({
                    user_id: req.user.id,
                    video_id: video.id,
                    reaction_type: reactionType,
                });
            }

            const summary = await syncReactionCounts(video);
            return res.json({
                message: currentReaction == null
                    ? 'Reaction removed'
                    : `Video ${reactionType}d`,
                likes_count: summary.likes,
                dislikes_count: summary.dislikes,
                current_reaction: currentReaction,
            });
        } catch (err) {
            console.error('React to video error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async shareVideo(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id, {
                include: [VideoCategory, User],
            });

            if (!video || !video.is_approved) {
                return res.status(404).json({ error: 'Video not found' });
            }

            video.shares_count = (video.shares_count || 0) + 1;
            await video.save();

            const host = `${req.protocol}://${req.get('host')}`;
            return res.json({
                message: 'Video shared',
                shares_count: video.shares_count,
                share_url: buildVideoShareUrl(host, video.id),
                video: formatVideo(video, host),
            });
        } catch (err) {
            console.error('Share video error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async registerDownload(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id, {
                include: [VideoCategory, User],
            });

            if (!video || !video.is_approved) {
                return res.status(404).json({ error: 'Video not found' });
            }

            video.downloads_count = (video.downloads_count || 0) + 1;
            await video.save();

            const host = `${req.protocol}://${req.get('host')}`;
            return res.json({
                message: 'Video download registered',
                downloads_count: video.downloads_count,
                download_url: buildPublicUrl(video.video_url, host),
                video: formatVideo(video, host),
            });
        } catch (err) {
            console.error('Register video download error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async getVideoSharePage(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id, {
                include: [VideoCategory, User],
            });

            if (!video || !video.is_approved) {
                return res.status(404).send('Video not found');
            }

            const host = `${req.protocol}://${req.get('host')}`;
            const payload = formatVideo(video, host);
            const title = String(payload.title || 'Shared video')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const description = String(payload.description || 'Watch this video on Agritracker.')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const category = String(payload.category_name || 'Featured video')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const creator = String(payload.creator_name || 'Agritracker')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            const shareUrl = buildVideoShareUrl(host, video.id);
            const videoUrl = payload.video_url || shareUrl;
            const creatorProfileUrl = payload.creator_id
                ? `${host}/api/myprofile/${payload.creator_id}`
                : '';
            const thumbUrl = payload.thumbnail_url || '';

            return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="video.other" />
  <meta property="og:url" content="${shareUrl}" />
  ${thumbUrl ? `<meta property="og:image" content="${thumbUrl}" />` : ''}
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #f5fbf4, #edf7f0); color: #102417; }
    .shell { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #fff; border-radius: 24px; padding: 28px; box-shadow: 0 20px 40px rgba(16,36,23,0.10); }
    .pill { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #e8f5e8; color: #2e7d32; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    h1 { font-size: 28px; line-height: 1.2; margin: 16px 0 10px; }
    p { font-size: 15px; line-height: 1.7; color: #4b5c4d; }
    .meta { display: flex; gap: 18px; flex-wrap: wrap; margin: 18px 0 26px; color: #466048; font-size: 14px; }
    .btn { display: inline-block; background: #2e7d32; color: #fff; text-decoration: none; padding: 14px 20px; border-radius: 16px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="pill">${category}</div>
      <h1>${title}</h1>
      <p>${description}</p>
      <div class="meta">
        <div>Creator: <strong>${creator}</strong></div>
        <div>Likes: <strong>${payload.likes_count || 0}</strong></div>
        <div>Shares: <strong>${payload.shares_count || 0}</strong></div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <a class="btn" href="${videoUrl}">Watch Video</a>
        <a class="btn" href="${shareUrl}" style="background:#14532d;">Open Shared Video</a>
        ${creatorProfileUrl ? `<a class="btn" href="${creatorProfileUrl}" style="background:#4b5c4d;">Visit Creator Store</a>` : ''}
      </div>
      <p>This shared page keeps the original Agritracker video context so viewers can open the exact shared content.</p>
    </div>
  </div>
</body>
</html>`);
        } catch (err) {
            console.error('Get video share page error:', err);
            return res.status(500).send('Failed to load video share page');
        }
    },

};

module.exports = videoController;
