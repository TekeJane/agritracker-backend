const { Post, User, Comment, Like } = require('../models');
const { Op } = require('sequelize');
const path = require('path');

// GET all posts (with user & comments)
exports.getPosts = async (req, res) => {
    console.log('\n📥 [GET] /api/posts called');
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

        const posts = await Post.findAll({
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

        console.log(`✅ ${posts.length} post(s) retrieved.`);
        res.json({ success: true, data: posts });
    } catch (error) {
        console.error('❌ Error in getPosts:', error);
        res.status(500).json({ success: false, message: 'Server error', error });
    }
};

// CREATE new post
exports.createPost = async (req, res) => {
    console.log('\n✉️ [POST] /api/posts called');
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

        const postWithUser = await Post.findByPk(newPost.id, {
            include: {
                model: User,
                attributes: ['id', 'full_name', 'profile_image', 'account_type']
            }
        });

        res.status(201).json({ success: true, data: postWithUser });
    } catch (error) {
        console.error('❌ Error in createPost:', error);
        res.status(500).json({ success: false, message: 'Failed to create post', error });
    }
};

// CREATE comment on a post
exports.createComment = async (req, res) => {
    console.log('\n💬 [POST] /api/comments called');
    try {
        const { user_id, post_id, text } = req.body;

        console.log(`➡️ Creating comment for post_id ${post_id} by user ${user_id}`);

        const comment = await Comment.create({
            user_id,
            post_id,
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

// LIKE a post
exports.likePost = async (req, res) => {
    console.log(`\n❤️ [POST] /api/posts/${req.params.postId}/like called`);
    try {
        const { user_id } = req.body;
        const { postId } = req.params;

        console.log(`🔎 Finding post ID ${postId}`);
        const post = await Post.findByPk(postId);

        if (!post) {
            console.log('❌ Post not found.');
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        console.log(`👍 Current likes: ${post.likes_count}`);
        await Like.create({
            user_id,
            post_id: postId
        });

        post.likes_count += 1;
        await post.save();

        console.log(`✅ Post likes incremented to: ${post.likes_count}`);
        res.json({ success: true, message: 'Post liked', likes: post.likes_count });
    } catch (error) {
        console.error('❌ Error in likePost:', error);
        res.status(500).json({ success: false, message: 'Failed to like post', error });
    }
};

// LIKE a comment
exports.likeComment = async (req, res) => {
    console.log(`\n❤️ [POST] /api/comments/${req.params.commentId}/like called`);
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



// DISLIKE a post
exports.dislikePost = async (req, res) => {
    console.log(`\n👎 [POST] /api/posts/${req.params.postId}/dislike called`);
    try {
        const { postId } = req.params;
        const post = await Post.findByPk(postId);

        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        post.dislikes_count += 1;
        await post.save();

        res.json({ success: true, message: 'Post disliked', dislikes: post.dislikes_count });
    } catch (error) {
        console.error('❌ Error in dislikePost:', error);
        res.status(500).json({ success: false, message: 'Failed to dislike post', error });
    }
};

// SHARE a post
exports.sharePost = async (req, res) => {
    console.log(`\n🔗 [POST] /api/posts/${req.params.postId}/share called`);
    try {
        const { postId } = req.params;
        const post = await Post.findByPk(postId);

        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        post.shares_count += 1;
        await post.save();

        res.json({ success: true, message: 'Post shared', shares: post.shares_count });
    } catch (error) {
        console.error('❌ Error in sharePost:', error);
        res.status(500).json({ success: false, message: 'Failed to share post', error });
    }
};

// UPDATE a post
exports.updatePost = async (req, res) => {
    console.log(`\n📝 [PUT] /api/posts/${req.params.postId} called`);
    try {
        const { postId } = req.params;
        const { user_id, title, text, category } = req.body;

        const post = await Post.findByPk(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        if (user_id && post.user_id !== parseInt(user_id)) {
            return res.status(403).json({ success: false, message: 'Not authorized to edit this post' });
        }

        if (title !== undefined) post.title = title;
        if (text !== undefined) post.text = text;
        if (category !== undefined) post.category = category;

        if (req.file) {
            post.image_url = `/uploads/${req.file.filename}`;
        }

        await post.save();

        const postWithUser = await Post.findByPk(post.id, {
            include: {
                model: User,
                attributes: ['id', 'full_name', 'profile_image', 'account_type']
            }
        });

        res.json({ success: true, data: postWithUser });
    } catch (error) {
        console.error('❌ Error in updatePost:', error);
        res.status(500).json({ success: false, message: 'Failed to update post', error });
    }
};

// DELETE a post
exports.deletePost = async (req, res) => {
    console.log(`\n🗑️ [DELETE] /api/posts/${req.params.postId} called`);
    try {
        const { postId } = req.params;
        const userId = req.body.user_id || req.query.user_id;

        const post = await Post.findByPk(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        if (userId && post.user_id !== parseInt(userId)) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this post' });
        }

        await post.destroy();
        res.json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('❌ Error in deletePost:', error);
        res.status(500).json({ success: false, message: 'Failed to delete post', error });
    }
};
