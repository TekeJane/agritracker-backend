const { Post, User, Comment, Like } = require('../models');
const { Op } = require('sequelize');
const path = require('path');

// GET all Posts (with user & comments)
exports.getPosts = async (req, res) => {
    console.log('\n📥 [GET] /api/Posts called');
    try {
        const { category, search, sort } = req.query;
        const whereClause = {};

        if (category && category !== 'all') {
            whereClause.category = category;
        }

        if (search && search.trim().length > 0) {
            whereClause[Op.or] = [
                { title: { [Op.like]: `%${search.trim()}%` } },
                { text: { [Op.like]: `%${search.trim()}%` } },
            ];
        }

        const order =
            sort === 'trending'
                ? [['likes_count', 'DESC'], ['createdAt', 'DESC']]
                : [['createdAt', 'DESC']];

        const Posts = await Post.findAll({
            where: whereClause,
            order,
            include: [
                {
                    model: User,
                    attributes: ['id', 'full_name', 'profile_image', 'account_type']
                },
                {
                    model: Comment,
                    include: {
                        model: User,
                        attributes: ['id', 'full_name', 'profile_image']
                    }
                }
            ]
        });

        console.log(`✅ ${Posts.length} Post(s) retrieved.`);
        const host = `${req.protocol}://${req.get('host')}`;
        const withUrls = Posts.map(p => {
            const json = p.toJSON();
            if (json.User && json.User.profile_image) {
                json.User.profile_image = json.User.profile_image.startsWith('http')
                    ? json.User.profile_image
                    : `${host}${json.User.profile_image.startsWith('/') ? '' : '/'}${json.User.profile_image}`;
            }
            if (json.Comments) {
                json.Comments = json.Comments.map(c => {
                    const cj = c;
                    if (cj.User && cj.User.profile_image) {
                        cj.User.profile_image = cj.User.profile_image.startsWith('http')
                            ? cj.User.profile_image
                            : `${host}${cj.User.profile_image.startsWith('/') ? '' : '/'}${cj.User.profile_image}`;
                    }
                    return cj;
                });
            }
            return json;
        });
        res.json({ success: true, data: withUrls });
    } catch (error) {
        console.error('❌ Error in getPosts:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// CREATE new Post
exports.createPost = async (req, res) => {
    console.log('\n✉️ [Post] /api/Posts called');
    try {
        const { user_id, title, text, category } = req.body;
        let image_url = null;

        if (req.file) {
            image_url = `/uploads/${req.file.filename}`;
            console.log('🖼️ Image will be saved as:', image_url);
        }

        const newPost = await Post.create({
            user_id,
            title,
            text,
            category: category || 'general',
            image_url
        });

        console.log('✅ Post saved with ID:', newPost.id);

        const PostWithUser = await Post.findByPk(newPost.id, {
            include: {
                model: User,
                attributes: ['id', 'full_name', 'profile_image', 'account_type']
            }
        });

        res.status(201).json({ success: true, data: PostWithUser });
    } catch (error) {
        console.error('❌ Error in createPost:', error);
        res.status(500).json({ success: false, message: 'Failed to create Post', error });
    }
};

// CREATE comment on a Post
exports.createComment = async (req, res) => {
    console.log('\n💬 [Post] /api/comments called');
    try {
        const { user_id, Post_id, post_id, text } = req.body;
        const resolvedPostId = Post_id || post_id;

        console.log(`➡️ Creating comment for Post_id ${resolvedPostId} by user ${user_id}`);

        if (!resolvedPostId || !user_id || !text) {
            return res.status(400).json({ success: false, message: 'post_id, user_id and text are required' });
        }

        const comment = await Comment.create({
            user_id,
            Post_id: resolvedPostId,
            text
        });

        const commentWithUser = await Comment.findByPk(comment.id, {
            include: {
                model: User,
                attributes: ['id', 'full_name', 'profile_image']
            }
        });

        console.log('✅ Comment created:', commentWithUser.id);
        res.status(201).json({ success: true, data: commentWithUser });
    } catch (error) {
        console.error('❌ Error in createComment:', error);
        res.status(500).json({ success: false, message: 'Failed to create comment', error });
    }
};

// LIKE a Post
exports.likePost = async (req, res) => {
    console.log(`\n❤️ [Post] /api/Posts/${req.params.PostId}/like called`);
    try {
        const { user_id } = req.body;
        const { PostId } = req.params;

        console.log(`🔎 Finding Post ID ${PostId}`);
        const Post = await Post.findByPk(PostId);

        if (!Post) {
            console.log('❌ Post not found.');
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        console.log(`👍 Current likes: ${Post.likes_count}`);
        await Like.create({
            user_id,
            Post_id: PostId
        });

        Post.likes_count += 1;
        await Post.save();

        console.log(`✅ Post likes incremented to: ${Post.likes_count}`);
        res.json({ success: true, message: 'Post liked', likes: Post.likes_count });
    } catch (error) {
        console.error('❌ Error in likePost:', error);
        res.status(500).json({ success: false, message: 'Failed to like Post', error });
    }
};

// LIKE a comment
exports.likeComment = async (req, res) => {
    console.log(`\n❤️ [Post] /api/comments/${req.params.commentId}/like called`);
    try {
        const { user_id } = req.body;
        const { commentId } = req.params;

        console.log(`🔎 Finding comment ID ${commentId}`);
        const comment = await Comment.findByPk(commentId);

        if (!comment) {
            console.log('❌ Comment not found.');
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        console.log(`👍 Current likes: ${comment.likes_count}`);
        await Like.create({
            user_id,
            comment_id: commentId
        });

        comment.likes_count += 1;
        await comment.save();

        console.log(`✅ Comment likes incremented to: ${comment.likes_count}`);
        res.json({ success: true, message: 'Comment liked', likes: comment.likes_count });
    } catch (error) {
        console.error('❌ Error in likeComment:', error);
        res.status(500).json({ success: false, message: 'Failed to like comment', error });
    }
};



// DISLIKE a Post
exports.dislikePost = async (req, res) => {
    console.log(`\n👎 [Post] /api/Posts/${req.params.PostId}/dislike called`);
    try {
        const { PostId } = req.params;
        const Post = await Post.findByPk(PostId);

        if (!Post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        Post.dislikes_count += 1;
        await Post.save();

        res.json({ success: true, message: 'Post disliked', dislikes: Post.dislikes_count });
    } catch (error) {
        console.error('❌ Error in dislikePost:', error);
        res.status(500).json({ success: false, message: 'Failed to dislike Post', error });
    }
};

// SHARE a Post
exports.sharePost = async (req, res) => {
    console.log(`\n🔗 [Post] /api/Posts/${req.params.PostId}/share called`);
    try {
        const { PostId } = req.params;
        const Post = await Post.findByPk(PostId);

        if (!Post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        Post.shares_count += 1;
        await Post.save();

        res.json({ success: true, message: 'Post shared', shares: Post.shares_count });
    } catch (error) {
        console.error('❌ Error in sharePost:', error);
        res.status(500).json({ success: false, message: 'Failed to share Post', error });
    }
};

// UPDATE a Post
exports.updatePost = async (req, res) => {
    console.log(`\n📝 [PUT] /api/Posts/${req.params.PostId} called`);
    try {
        const { PostId } = req.params;
        const { user_id, title, text, category } = req.body;

        const Post = await Post.findByPk(PostId);
        if (!Post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        if (user_id && Post.user_id !== parseInt(user_id)) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this Post' });
        }

        if (title !== undefined) Post.title = title;
        if (text !== undefined) Post.text = text;
        if (category !== undefined) Post.category = category;

        if (req.file) {
            Post.image_url = `/uploads/${req.file.filename}`;
        }

        await Post.save();

        const PostWithUser = await Post.findByPk(Post.id, {
            include: {
                model: User,
                attributes: ['id', 'full_name', 'profile_image', 'account_type']
            }
        });

        res.json({ success: true, data: PostWithUser });
    } catch (error) {
        console.error('❌ Error in updatePost:', error);
        res.status(500).json({ success: false, message: 'Failed to update Post', error });
    }
};

// DELETE a Post
exports.deletePost = async (req, res) => {
    console.log(`\n🗑️ [DELETE] /api/Posts/${req.params.PostId} called`);
    try {
        const { PostId } = req.params;
        const userId = req.body.user_id || req.query.user_id;

        const Post = await Post.findByPk(PostId);
        if (!Post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        if (userId && Post.user_id !== parseInt(userId)) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this Post' });
        }

        await Post.destroy();
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('❌ Error in deletePost:', error);
        res.status(500).json({ success: false, message: 'Failed to delete Post', error });
    }
};
