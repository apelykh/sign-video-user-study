#!/bin/bash
# Helper script to prepare video files for the survey

set -e

VIDEOS_DIR="videos"
mkdir -p "$VIDEOS_DIR"

echo "Video Preparation Script for User Study"
echo "========================================"
echo ""

# Check if user has source videos
read -p "Do you have a directory with your generated videos? (y/n): " has_videos

if [ "$has_videos" != "y" ]; then
    echo "Please generate videos first from all 4 models (ours, fun_control, signvip, signgan)"
    echo "for the selected clips, then run this script again."
    exit 1
fi

read -p "Enter the path to your videos directory: " SOURCE_DIR

if [ ! -d "$SOURCE_DIR" ]; then
    echo "Error: Directory $SOURCE_DIR does not exist"
    exit 1
fi

echo ""
echo "Expected video naming in source directory:"
echo "  BSL clips: bsl_01_ours.mp4, bsl_01_fun_control.mp4, bsl_01_signvip.mp4, bsl_01_signgan.mp4"
echo "  RWTH clips: rwth_01_ours.mp4, rwth_01_fun_control.mp4, etc."
echo "  Comp clips: comp_01_ours.mp4, comp_01_fun_control.mp4, etc."
echo ""

read -p "Is your naming convention different? (y/n): " different_naming

# Copy videos
echo ""
echo "Copying and renaming videos..."

MODELS=("ours" "fun_control" "signvip" "signgan")

# Quality - BSL clips
for i in {01..05}; do
    for model in "${MODELS[@]}"; do
        target="$VIDEOS_DIR/quality_bsl_${i}_${model}.mp4"

        if [ "$different_naming" == "y" ]; then
            echo "Please manually copy/rename: $target"
        else
            source="$SOURCE_DIR/bsl_${i}_${model}.mp4"
            if [ -f "$source" ]; then
                cp "$source" "$target"
                echo "✓ Copied $target"
            else
                echo "⚠ Missing: $source"
            fi
        fi
    done
done

# Quality - RWTH clips
for i in {01..05}; do
    for model in "${MODELS[@]}"; do
        target="$VIDEOS_DIR/quality_rwth_${i}_${model}.mp4"

        if [ "$different_naming" == "y" ]; then
            echo "Please manually copy/rename: $target"
        else
            source="$SOURCE_DIR/rwth_${i}_${model}.mp4"
            if [ -f "$source" ]; then
                cp "$source" "$target"
                echo "✓ Copied $target"
            else
                echo "⚠ Missing: $source"
            fi
        fi
    done
done

# Comprehensibility clips
for i in {01..06}; do
    for model in "ours" "fun_control"; do
        target="$VIDEOS_DIR/comp_${i}_${model}.mp4"

        if [ "$different_naming" == "y" ]; then
            echo "Please manually copy/rename: $target"
        else
            source="$SOURCE_DIR/comp_${i}_${model}.mp4"
            if [ -f "$source" ]; then
                cp "$source" "$target"
                echo "✓ Copied $target"
            else
                echo "⚠ Missing: $source"
            fi
        fi
    done
done

echo ""
echo "Video preparation complete!"
echo ""
echo "Next steps:"
echo "1. Review videos in $VIDEOS_DIR/ directory"
echo "2. Test survey locally: python3 -m http.server 8000"
echo "3. Deploy to GitHub Pages (see README.md)"
echo ""

# Check total size
TOTAL_SIZE=$(du -sh "$VIDEOS_DIR" | cut -f1)
echo "Total videos directory size: $TOTAL_SIZE"
echo "GitHub Pages limit: 1 GB"
