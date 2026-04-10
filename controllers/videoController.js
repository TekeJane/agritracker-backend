const { Op } = require('sequelize');
const jwt = require('jsonwebtoken');
const { VideoTip, VideoCategory, User, VideoReaction } = require('../models');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const {
    ensureUploadDir,
    resolveUploadFilePath,
    toUploadDbPath,
} = require('../config/uploadPaths');
const { buildPublicMediaUrl } = require('../utils/publicMediaUrl');
ffmpeg.setFfmpegPath(ffmpegPath);

function buildPublicUrl(value, host) {
    return buildPublicMediaUrl(value, host);
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

function buildVideoDownloadUrl(host, videoId) {
    return `${host}/api/videos/${videoId}/download-file`;
}

function sanitizeVideoFilename(title, filePath) {
    const extension = path.extname(filePath) || '.mp4';
    const safeTitle = String(title || 'agritracker-video')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/ /g, '_');

    return `${safeTitle || 'agritracker-video'}${extension}`;
}

async function loadApprovedVideoOr404(videoId, res, includeRelations = false) {
    const video = await VideoTip.findByPk(videoId, {
        include: includeRelations ? [VideoCategory, User] : undefined,
    });

    if (!video || !video.is_approved) {
        res.status(404).json({ error: 'Video not found' });
        return null;
    }

    return video;
}

function resolveVideoDownloadFile(video, res) {
    const filePath = resolveUploadFilePath(video.video_url);
    if (!filePath || !fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Video file not found' });
        return null;
    }

    return filePath;
}

function sendVideoDownloadResponse(res, filePath, videoTitle) {
    const filename = sanitizeVideoFilename(videoTitle, filePath);
    res.type(filename);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.download(filePath, filename);
}

function buildVideoShareMessage(videoPayload, shareUrl) {
    const title = String(videoPayload?.title || 'AgriTracker video').trim();
    const category = String(videoPayload?.category_name || 'Agriculture').trim();
    const creator = String(videoPayload?.creator_name || 'AgriTracker').trim();
    const description = String(videoPayload?.description || '').trim();
    const summary = description.length > 160
        ? `${description.slice(0, 157).trim()}...`
        : description;

    return [
        `Watch "${title}" on AgriTracker.`,
        `Category: ${category}`,
        `Creator: ${creator}`,
        summary || null,
        shareUrl,
    ].filter(Boolean).join('\n\n');
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildAppDeepLinkUrl(type, id) {
    return `agritracker://${type}/${id}`;
}

function normalizeCategoryName(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeRoleValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase();
}

function normalizeVideoContentSource(value, fallback = 'feature_video') {
    const normalized = String(value || '')
        .trim()
        .toLowerCase();

    return ['general', 'feature_video', 'ebook_clip'].includes(normalized)
        ? normalized
        : fallback;
}

function normalizeCreatorLink(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }
    if (raw.startsWith('@')) {
        return `https://www.tiktok.com/${raw}`;
    }
    if (raw.includes('.') && !raw.includes(' ')) {
        return `https://${raw.replace(/^\/+/, '')}`;
    }
    return null;
}

function parsePositiveInteger(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    const parsed = Number.parseInt(String(value).trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return null;
    }

    return parsed;
}

function collectUploadedFilePaths(req) {
    return Object.values(req.files || {})
        .flat()
        .map((file) => file?.path)
        .filter(Boolean);
}

async function cleanupUploadedFiles(filePaths = []) {
    await Promise.all(
        filePaths.map(async (filePath) => {
            try {
                await fs.promises.unlink(filePath);
            } catch (_) {
                // Ignore cleanup failures so the real upload error can be returned.
            }
        }),
    );
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
        download_url: buildVideoDownloadUrl(host, item.id),
    };
}

async function generateThumbnailForVideo(videoId, videoFilePath) {
    const thumbnailDir = ensureUploadDir('thumbnails');
    const thumbnailPath = path.join(
        thumbnailDir,
        `${Date.now()}_${videoId}_thumbnail.png`
    );

    await new Promise((resolve, reject) => {
        ffmpeg(videoFilePath)
            .on('end', resolve)
            .on('error', reject)
            .screenshots({
                count: 1,
                folder: path.dirname(thumbnailPath),
                filename: path.basename(thumbnailPath),
                size: '320x240',
                timemarks: ['3'],
            });
    });

    const videoRecord = await VideoTip.findByPk(videoId);
    if (!videoRecord) {
        return;
    }

    await videoRecord.update({
        thumbnail_url: toUploadDbPath(thumbnailPath),
    });
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

    if (query.featured === 'true') {
        whereClause.is_featured = true;
    } else if (query.featured === 'false') {
        whereClause.is_featured = false;
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
        const uploadedFilePaths = collectUploadedFilePaths(req);

        try {
            const { creator_name, creator_link, content_source } = req.body;
            const videoFile = req.files?.video_url?.[0];
            const thumbnailFile = req.files?.thumbnail_image?.[0] || null;
            const creatorImageFile = req.files?.creator_image?.[0] || null;
            const title = String(req.body.title || '').trim();
            const description = String(req.body.description || '').trim();
            const categoryId = parsePositiveInteger(req.body.category_id);
            const ebookId = parsePositiveInteger(req.body.ebook_id);

            if (!videoFile) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(400).json({ error: 'Video file required' });
            }

            if (!title) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(400).json({ error: 'Title is required' });
            }

            if (!categoryId) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(400).json({ error: 'A valid category is required' });
            }

            if (description.length > 5000) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(400).json({ error: 'Description is too long' });
            }

            if (!req.user?.id) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(401).json({ error: 'Authenticated user is required to upload a video' });
            }

            const uploader = req.user?.id
                ? await User.findByPk(req.user.id, {
                    attributes: [
                        'id',
                        'full_name',
                        'role',
                        'facEbook',
                        'instagram',
                        'twitter',
                        'tiktok',
                    ],
                })
                : null;

            const uploaderRole = normalizeRoleValue(uploader?.role || req.user?.role);
            const isAdminUpload = uploaderRole === 'admin';
            const normalizedContentSource = isAdminUpload
                ? normalizeVideoContentSource(content_source, 'feature_video')
                : 'ebook_clip';

            const categoryWhereClause = isAdminUpload
                ? { id: categoryId }
                : { id: categoryId, is_active: true };
            const selectedCategory = await VideoCategory.findOne({ where: categoryWhereClause });

            if (!selectedCategory) {
                await cleanupUploadedFiles(uploadedFilePaths);
                return res.status(400).json({
                    error: 'Selected video category was not found. Refresh categories and try again.',
                });
            }

            const normalizedCreatorName = String(creator_name || '').trim()
                || uploader?.full_name
                || null;
            const normalizedCreatorLink =
                normalizeCreatorLink(creator_link) ||
                buildCreatorLink(uploader) ||
                null;

            const video = await VideoTip.create({
                title,
                description: description || null,
                video_url: toUploadDbPath(videoFile.path),
                thumbnail_url: toUploadDbPath(thumbnailFile?.path || null),
                category_id: categoryId,
                uploaded_by: req.user.id,
                creator_image: toUploadDbPath(creatorImageFile?.path || null),
                creator_name: normalizedCreatorName,
                creator_link: normalizedCreatorLink,
                content_source: normalizedContentSource,
                ebook_id: ebookId,
                is_approved: isAdminUpload,
                is_featured: false,
            });

            const fullVideo = await VideoTip.findByPk(video.id, {
                include: [VideoCategory, User],
            });
            const host = `${req.protocol}://${req.get('host')}`;

            res.status(201).json({
                message: isAdminUpload
                    ? 'Video uploaded successfully'
                    : 'Video uploaded and awaiting approval',
                thumbnail_processing: !thumbnailFile,
                video: formatVideo(fullVideo, host),
            });

            if (!thumbnailFile) {
                setImmediate(async () => {
                    try {
                        await generateThumbnailForVideo(video.id, videoFile.path);
                        console.log(`Thumbnail generated for video ${video.id}`);
                    } catch (thumbnailError) {
                        console.error(
                            `Thumbnail generation failed for video ${video.id}:`,
                            thumbnailError,
                        );
                    }
                });
            }
        } catch (err) {
            console.error("Upload error:", err);
            await cleanupUploadedFiles(uploadedFilePaths);
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
            const name = normalizeCategoryName(req.body.name);
            const description = req.body.description?.toString().trim() || null;

            if (!name) {
                return res.status(400).json({ error: 'Category name is required' });
            }

            const categories = await VideoCategory.findAll();
            const existingCategory = categories.find(
                (category) => normalizeCategoryName(category.name).toLowerCase() === name.toLowerCase(),
            );

            if (existingCategory) {
                if (!existingCategory.is_active) {
                    existingCategory.is_active = true;
                }
                existingCategory.name = name;
                existingCategory.description = description || existingCategory.description;
                await existingCategory.save();
                return res.status(200).json({
                    message: 'Video category already existed and is now available',
                    category: existingCategory,
                });
            }

            const category = await VideoCategory.create({ name, description, is_active: true });

            console.log("Category created:", category.toJSON());
            res.status(201).json({
                message: 'Video category created successfully',
                category,
            });
        } catch (err) {
            console.error("Create category error:", err);
            res.status(500).json({ error: err.message });
        }
    },

    async featureVideo(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id);
            if (!video) {
                return res.status(404).json({ error: 'Video not found' });
            }

            video.is_featured = true;
            await video.save();
            return res.json({ message: 'Video marked as featured.' });
        } catch (err) {
            console.error('Feature video error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async unfeatureVideo(req, res) {
        try {
            const video = await VideoTip.findByPk(req.params.id);
            if (!video) {
                return res.status(404).json({ error: 'Video not found' });
            }

            video.is_featured = false;
            await video.save();
            return res.json({ message: 'Video removed from featured.' });
        } catch (err) {
            console.error('Unfeature video error:', err);
            return res.status(500).json({ error: err.message });
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
            const categories = await VideoCategory.findAll({
                where: { is_active: true },
                order: [['name', 'ASC']],
            });

            console.log(`Fetched ${categories.length} categories`);
            res.set('Cache-Control', 'no-store');
            res.json({
                categories,
                count: categories.length,
            });
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
            const payload = formatVideo(video, host);
            return res.json({
                message: 'Video shared',
                shares_count: video.shares_count,
                share_url: buildVideoShareUrl(host, video.id),
                share_message: buildVideoShareMessage(payload, buildVideoShareUrl(host, video.id)),
                video: payload,
            });
        } catch (err) {
            console.error('Share video error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async registerDownload(req, res) {
        try {
            const video = await loadApprovedVideoOr404(
                req.params.id,
                res,
                true,
            );
            if (!video) return;

            video.downloads_count = (video.downloads_count || 0) + 1;
            await video.save();

            const host = `${req.protocol}://${req.get('host')}`;
            return res.json({
                message: 'Video download registered',
                downloads_count: video.downloads_count,
                download_url: buildVideoDownloadUrl(host, video.id),
                video: formatVideo(video, host),
            });
        } catch (err) {
            console.error('Register video download error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async downloadVideo(req, res) {
        try {
            const video = await loadApprovedVideoOr404(req.params.id, res);
            if (!video) return;

            const filePath = resolveVideoDownloadFile(video, res);
            if (!filePath) return;

            video.downloads_count = (video.downloads_count || 0) + 1;
            await video.save();

            return sendVideoDownloadResponse(res, filePath, video.title);
        } catch (err) {
            console.error('Direct video download error:', err);
            return res.status(500).json({ error: err.message });
        }
    },

    async serveVideoDownload(req, res) {
        try {
            const video = await loadApprovedVideoOr404(req.params.id, res);
            if (!video) return;

            const filePath = resolveVideoDownloadFile(video, res);
            if (!filePath) return;

            return sendVideoDownloadResponse(res, filePath, video.title);
        } catch (err) {
            console.error('Serve video download error:', err);
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
            const title = escapeHtml(payload.title || 'Shared video');
            const description = escapeHtml(
                payload.description ||
                `${payload.category_name || 'Agriculture'} video from ${payload.creator_name || 'AgriTracker'} on AgriTracker.`
            );
            const category = escapeHtml(payload.category_name || 'Featured video');
            const creator = escapeHtml(payload.creator_name || 'Agritracker');
            const shareUrl = buildVideoShareUrl(host, video.id);
            const appUrl = buildAppDeepLinkUrl('video', video.id);
            const thumbUrl = payload.thumbnail_url || '';

            return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:site_name" content="AgriTracker" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="video.other" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="al:android:url" content="${escapeHtml(appUrl)}" />
  <meta property="al:ios:url" content="${escapeHtml(appUrl)}" />
  ${thumbUrl ? `<meta property="og:image" content="${thumbUrl}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  ${thumbUrl ? `<meta name="twitter:image" content="${thumbUrl}" />` : ''}
  <script>
    window.addEventListener('load', function () {
      setTimeout(function () {
        window.location.href = ${JSON.stringify(appUrl)};
      }, 180);
    });
  </script>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: linear-gradient(180deg, #f5fbf4, #edf7f0); color: #102417; }
    .shell { max-width: 720px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #fff; border-radius: 24px; padding: 28px; box-shadow: 0 20px 40px rgba(16,36,23,0.10); }
    .pill { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #e8f5e8; color: #2e7d32; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    h1 { font-size: 28px; line-height: 1.2; margin: 16px 0 10px; }
    p { font-size: 15px; line-height: 1.7; color: #4b5c4d; }
    .thumb { display: block; width: 100%; border-radius: 20px; overflow: hidden; margin: 18px 0 22px; background: #edf7f0; text-decoration: none; }
    .thumb img { width: 100%; display: block; object-fit: cover; max-height: 360px; }
    .meta { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 18px; color: #466048; font-size: 14px; }
    .actions { display:flex; gap:12px; flex-wrap:wrap; margin-top:22px; }
    .button { display:inline-flex; align-items:center; justify-content:center; padding:12px 18px; border-radius:14px; text-decoration:none; font-weight:700; }
    .button-primary { background:#2e7d32; color:#fff; }
    .button-secondary { background:#edf7f0; color:#1d4d2b; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="card">
      <div class="pill">${category}</div>
      <h1>${title}</h1>
      <p>${description}</p>
      ${thumbUrl ? `
      <a class="thumb" href="${appUrl}">
        <img src="${thumbUrl}" alt="${title}" />
      </a>` : ''}
      <div class="meta">
        <div>Category: <strong>${category}</strong></div>
        <div>Creator: <strong>${creator}</strong></div>
      </div>
      <div class="actions">
        <a class="button button-primary" href="${appUrl}">Open In App</a>
        <a class="button button-secondary" href="${shareUrl}">Browser Preview</a>
      </div>
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
