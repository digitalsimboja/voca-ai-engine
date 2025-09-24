#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_header() {
    echo -e "${BLUE}🛑 $1${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

# Function to check if docker compose is available
check_docker_compose() {
    if ! command -v docker compose &> /dev/null; then
        print_error "docker compose is not installed. Please install it and try again."
        exit 1
    fi
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -h, --help          Show this help message"
    echo "  -s, --status        Show status before stopping"
    echo "  -c, --clean         Stop and remove all containers and volumes"
    echo "  -v, --volumes       Remove all Docker volumes (system-wide)"
    echo "  -p, --project-volumes  Remove only project-specific volumes"
    echo ""
    echo "Examples:"
    echo "  $0                  # Stop all services and remove all volumes"
    echo "  $0 --status         # Show status then stop"
    echo "  $0 --clean          # Stop and remove all containers and volumes"
    echo "  $0 --volumes        # Remove all Docker volumes (system-wide)"
    echo "  $0 --project-volumes # Remove only project volumes"
}

# Function to show status
show_status() {
    print_info "Current service status:"
    docker compose ps
    echo ""
}

# Function to clean up dynamic characters directory
cleanup_dynamic_characters() {
    local dynamic_chars_dir="$HOME/dev/bojalabs/voca-ai-engine/services/voca-os/characters/dynamic"
    
    if [ -d "$dynamic_chars_dir" ]; then
        print_info "Cleaning up dynamic characters directory..."
        rm -rf "$dynamic_chars_dir"
        print_status "Dynamic characters directory removed: $dynamic_chars_dir"
    else
        print_info "Dynamic characters directory not found: $dynamic_chars_dir"
    fi
}

# Function to stop all services
stop_all_services() {
    print_header "Stopping all Voca AI services..."
    
    # Stop and remove project-specific containers and volumes
    docker compose down -v --remove-orphans
    
    # Stop all remaining containers
    docker stop $(docker ps -q) 2>/dev/null || true
    
    # Remove all containers
    docker rm $(docker ps -aq) 2>/dev/null || true
    
    # Remove all volumes (aggressive cleanup)
    print_info "Removing all Docker volumes..."
    docker volume ls -q | xargs -r docker volume rm 2>/dev/null || true
    
    # Clean up any remaining volumes
    docker volume prune -f
    
    # Clean up dynamic characters directory
    cleanup_dynamic_characters
    
    print_status "All services stopped and volumes removed"
}

# Function to clean up
clean_up() {
    print_header "Cleaning up all Voca AI services..."
    print_warning "This will remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Stop and remove all containers, networks, and volumes
        docker compose down -v --remove-orphans
        
        # Remove any remaining containers
        docker stop $(docker ps -aq) 2>/dev/null || true
        docker rm $(docker ps -aq) 2>/dev/null || true
        
        # Remove all volumes (including named and anonymous)
        docker volume prune -f
        
        # Remove any dangling volumes
        docker volume ls -q -f dangling=true | xargs -r docker volume rm 2>/dev/null || true
        
        # Clean up dynamic characters directory
        cleanup_dynamic_characters
        
        print_status "All containers, networks, and volumes removed"
    else
        print_info "Cleanup cancelled"
    fi
}

# Function to remove only volumes
remove_volumes() {
    print_header "Removing all Docker volumes..."
    print_warning "This will remove ALL Docker volumes on your system!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Stop all running containers first
        print_info "Stopping all running containers..."
        docker stop $(docker ps -q) 2>/dev/null || true
        
        # Remove all containers
        print_info "Removing all containers..."
        docker rm $(docker ps -aq) 2>/dev/null || true
        
        # Remove all volumes (this is the most aggressive approach)
        print_info "Removing all Docker volumes..."
        docker volume ls -q | xargs -r docker volume rm 2>/dev/null || true
        
        # Also run volume prune to catch any remaining
        docker volume prune -f
        
        # Remove any dangling volumes
        docker volume ls -q -f dangling=true | xargs -r docker volume rm 2>/dev/null || true
        
        print_status "All volumes removed"
    else
        print_info "Volume removal cancelled"
    fi
}

# Function to remove only project volumes
remove_project_volumes() {
    print_header "Removing Voca AI project volumes only..."
    
    # Get the project name from docker-compose
    PROJECT_NAME=$(basename $(pwd))
    
    print_info "Removing volumes for project: $PROJECT_NAME"
    
    # Remove volumes with project prefix
    docker volume ls -q | grep "^${PROJECT_NAME}_" | xargs -r docker volume rm 2>/dev/null || true
    
    # Also remove any volumes that might be named differently
    docker volume ls -q | grep "voca-ai-engine" | xargs -r docker volume rm 2>/dev/null || true
    
    print_status "Project volumes removed"
}

# Main script logic
main() {
    # Check prerequisites
    check_docker
    check_docker_compose
    
    # Parse arguments
    if [ $# -eq 0 ]; then
        stop_all_services
        exit 0
    fi
    
    case "$1" in
        -h|--help)
            show_usage
            ;;
        -s|--status)
            show_status
            stop_all_services
            ;;
        -c|--clean)
            clean_up
            ;;
        -v|--volumes)
            remove_volumes
            ;;
        -p|--project-volumes)
            remove_project_volumes
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
