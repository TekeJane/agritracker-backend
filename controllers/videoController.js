const { VideoTip, VideoCategory, User } = require('../models');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { authenticate } = require('../middleware/authMiddleware');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
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

function formatVideo(video, host) {
    const item = video.toJSON ? video.toJSON() : video;
    const creator = item.User || {};
    return {
        ...item,
        thumbnail: buildPublicUrl(item.thumbnail_url, host),
        thumbnail_url: buildPublicUrl(item.thumbnail_url, host),
        video_url: buildPublicUrl(item.video_url, host),
        creator_name: creator.full_name || item.creator_name || 'Creator',
        creator_link: item.creator_link || buildCreatorLink(creator),
    };
}

const videoController = {
    // ✅ Create a video tip
    async uploadVideo(req, res) {
        try {
            console.log("Uploading video...");
            const { title, description, category_id } = req.body;
            console.log("Request body:", req.body);

            const videoFile = req.files?.video_url?.[0];
            console.log("Uploaded file info:", videoFile);

            if (!videoFile) {
                console.log("No video file provided.");
                return res.status(400).json({ error: 'Video file required' });
            }

            let thumbnailPath = req.files?.thumbnail_image?.[0]?.path || null;

            if (!thumbnailPath) {
                thumbnailPath = `uploads/thumbnails/${Date.now()}_thumbnail.png`;
                console.log("Thumbnail will be saved to:", thumbnailPath);

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
            }

            const video = await VideoTip.create({
                title,
                description,
                video_url: videoFile.path,
                thumbnail_url: thumbnailPath,
                category_id,
                uploaded_by: req.user.id,
                is_approved: req.user.role === 'admin',
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
            const whereClause = { is_approved: true };

            if (req.query.category_id) {
                whereClause.category_id = req.query.category_id;
            }

            if (req.query.category) {
                whereClause['$VideoCategory.name$'] = req.query.category;
                console.log("Filtering by category:", req.query.category);
            }

            const videos = await VideoTip.findAll({
                where: whereClause,
                include: [VideoCategory, User],
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

            const whereClause = { is_approved: isApproved };

            if (req.query.category_id) {
                whereClause.category_id = req.query.category_id;
            }

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

            const count = await VideoTip.count({ where: { is_approved: true } });

            if (count === 0) {
                return res.status(404).json({ error: 'No approved videos found' });
            }

            const randomOffset = Math.floor(Math.random() * count);

            const video = await VideoTip.findOne({
                where: { is_approved: true },
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
            const count = await VideoTip.count({ where: { is_approved: true } });
            const limit = parseInt(req.query.limit) || 4;
            const randomOffset = Math.max(0, Math.floor(Math.random() * Math.max(1, count - limit)));

            const videos = await VideoTip.findAll({
                where: { is_approved: true },
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
    }

};

module.exports = videoController;
